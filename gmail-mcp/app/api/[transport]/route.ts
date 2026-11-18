// MCP endpoint: https://<your-app>/api/mcp?key=<APP_SECRET>
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { isValidSecret } from "@/lib/crypto";
import { listAccounts, type Account } from "@/lib/db";
import * as gm from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (err: unknown) => ({
  content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
  isError: true,
});

/** Accepts an email address or a nickname/label; defaults to the only account if there is one. */
async function resolveAccount(input?: string): Promise<string> {
  const accounts = await listAccounts();
  if (!accounts.length) throw new Error("No Gmail accounts connected yet. Open /accounts to add one.");
  if (!input) {
    if (accounts.length === 1) return accounts[0].email;
    throw new Error(`Specify an account. Connected: ${describe(accounts)}`);
  }
  const q = input.trim().toLowerCase();
  const hit = accounts.find((a) => a.email === q || a.label?.toLowerCase() === q);
  if (!hit) throw new Error(`Unknown account "${input}". Connected: ${describe(accounts)}`);
  return hit.email;
}

const describe = (accounts: Account[]) => accounts.map((a) => (a.label ? `${a.label} <${a.email}>` : a.email)).join(", ");

const accountArg = z
  .string()
  .optional()
  .describe("Account email or nickname (from list_accounts). Optional if only one account is connected.");

const mcp = createMcpHandler(
  (server) => {
    server.tool(
      "list_accounts",
      "List every connected Gmail account with its nickname. Call this first to know which inboxes exist.",
      {},
      async () => {
        try {
          return json(await listAccounts());
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "search_email",
      "Search threads using Gmail search syntax (e.g. 'is:unread newer_than:2d', 'from:alice subject:invoice'). " +
        "Searches ALL connected accounts unless 'accounts' is given. Results include which account each thread is in.",
      {
        query: z.string().describe("Gmail search query"),
        accounts: z.array(z.string()).optional().describe("Limit to these account emails/nicknames"),
        max_per_account: z.number().int().min(1).max(50).default(10),
      },
      async ({ query, accounts, max_per_account }) => {
        try {
          const targets = accounts?.length
            ? await Promise.all(accounts.map((a) => resolveAccount(a)))
            : (await listAccounts()).map((a) => a.email);
          const settled = await Promise.allSettled(targets.map((e) => gm.searchThreads(e, query, max_per_account)));
          const results = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
          const errors = settled
            .map((s, i) => (s.status === "rejected" ? { account: targets[i], error: String(s.reason) } : null))
            .filter(Boolean);
          return json({ results, errors });
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "read_thread",
      "Read the full text of every message in a thread.",
      { account: accountArg, thread_id: z.string() },
      async ({ account, thread_id }) => {
        try {
          return json(await gm.getThread(await resolveAccount(account), thread_id));
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "create_draft",
      "Create a draft (never sends). For a reply, pass thread_id and the recipients/subject/threading headers are filled in " +
        "automatically from the latest message. The draft is created in the given account, so it is sent from that address.",
      {
        account: accountArg,
        body: z.string().describe("Plain-text body"),
        thread_id: z.string().optional().describe("Reply within this thread"),
        reply_all: z.boolean().default(false),
        to: z.string().optional(),
        cc: z.string().optional(),
        bcc: z.string().optional(),
        subject: z.string().optional(),
      },
      async ({ account, thread_id, reply_all, ...rest }) => {
        try {
          return json(await gm.createDraft(await resolveAccount(account), { ...rest, threadId: thread_id, replyAll: reply_all }));
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "list_drafts",
      "List recent drafts in an account.",
      { account: accountArg, max: z.number().int().min(1).max(50).default(10) },
      async ({ account, max }) => {
        try {
          return json(await gm.listDrafts(await resolveAccount(account), max));
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "send_draft",
      "Send an existing draft. ONLY call this after the user has explicitly approved sending this specific draft.",
      { account: accountArg, draft_id: z.string() },
      async ({ account, draft_id }) => {
        try {
          return json(await gm.sendDraft(await resolveAccount(account), draft_id));
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "update_labels",
      "Add/remove labels on a thread. Archive = remove INBOX. Mark read = remove UNREAD. Star = add STARRED. " +
        "Custom labels can be given by name.",
      {
        account: accountArg,
        thread_id: z.string(),
        add: z.array(z.string()).default([]),
        remove: z.array(z.string()).default([]),
      },
      async ({ account, thread_id, add, remove }) => {
        try {
          return json(await gm.modifyThread(await resolveAccount(account), thread_id, add, remove));
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "bulk_archive",
      "Archive every inbox email in ONE account that matches a Gmail search (e.g. 'category:promotions', " +
        "'from:costco.com older_than:30d'), in a few requests instead of one call per thread. The search is always " +
        "limited to the inbox. Nothing is deleted: archived mail stays in All Mail. Run with dry_run=true first to see " +
        "how many emails match and a sample, then run again with dry_run=false. If hitLimit is true, run it again " +
        "to archive the rest.",
      {
        account: z.string().describe("Account email or nickname (from list_accounts). Required: one account per call."),
        query: z.string().min(1).describe("Gmail search query selecting what to archive"),
        mark_read: z.boolean().default(false).describe("Also mark the archived emails as read"),
        dry_run: z.boolean().default(true).describe("Preview only: count matches and show a sample without changing anything"),
        limit: z.number().int().min(1).max(10000).default(2000).describe("Maximum emails to archive in this call"),
      },
      async ({ account, query, mark_read, dry_run, limit }) => {
        try {
          const r = await gm.bulkArchive(await resolveAccount(account), query, { markRead: mark_read, dryRun: dry_run, limit });
          return json(r);
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.tool(
      "list_labels",
      "List the labels in an account.",
      { account: accountArg },
      async ({ account }) => {
        try {
          const labels = await gm.listLabels(await resolveAccount(account));
          return json(labels.map((l) => ({ id: l.id, name: l.name, type: l.type })));
        } catch (e) {
          return fail(e);
        }
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 },
);

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!isValidSecret(url.searchParams.get("key") ?? bearer)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return mcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };
