// Thin Gmail REST wrapper (no googleapis dependency).
import { accessTokenFor } from "./google";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmail<T>(email: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessTokenFor(email);
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gmail ${res.status} (${email}): ${await res.text()}`);
  return (await res.json()) as T;
}

/** Used right after OAuth, before the account is stored. */
export async function profileFromToken(accessToken: string): Promise<{ emailAddress: string }> {
  const res = await fetch(`${BASE}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gmail profile ${res.status}: ${await res.text()}`);
  return (await res.json()) as { emailAddress: string };
}

// ---------- types ----------
interface Header { name: string; value: string }
interface Part {
  mimeType: string;
  filename?: string;
  headers?: Header[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: Part[];
}
interface Message {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: Part;
}
interface Thread { id: string; messages?: Message[] }

// ---------- helpers ----------
const header = (m: Message, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const b64urlEncode = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function findBody(part: Part | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data && !part.filename) return b64urlDecode(part.body.data);
  for (const p of part.parts ?? []) {
    const found = findBody(p, mime);
    if (found) return found;
  }
  return null;
}

function attachments(part: Part | undefined, out: string[] = []): string[] {
  if (!part) return out;
  if (part.filename) out.push(part.filename);
  for (const p of part.parts ?? []) attachments(p, out);
  return out;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function encodeHeader(value: string): string {
  // RFC 2047 for non-ASCII subjects/names
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

// ---------- operations ----------
export interface ThreadSummary {
  account: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  messageCount: number;
  unread: boolean;
  labels: string[];
}

export async function searchThreads(email: string, query: string, max = 10): Promise<ThreadSummary[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(Math.min(max, 50)) });
  const list = await gmail<{ threads?: { id: string }[] }>(email, `threads?${params}`);
  const ids = list.threads?.map((t) => t.id) ?? [];

  const meta = new URLSearchParams({ format: "metadata" });
  for (const h of ["From", "Subject", "Date"]) meta.append("metadataHeaders", h);

  return Promise.all(
    ids.map(async (id) => {
      const t = await gmail<Thread>(email, `threads/${id}?${meta}`);
      const msgs = t.messages ?? [];
      const first = msgs[0];
      const last = msgs[msgs.length - 1];
      const labels = new Set(msgs.flatMap((m) => m.labelIds ?? []));
      return {
        account: email,
        threadId: id,
        subject: first ? header(first, "Subject") : "",
        from: last ? header(last, "From") : "",
        date: last ? header(last, "Date") : "",
        snippet: last?.snippet ?? "",
        messageCount: msgs.length,
        unread: labels.has("UNREAD"),
        labels: [...labels],
      };
    }),
  );
}

export interface FullMessage {
  messageId: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  body: string;
  attachments: string[];
}

export async function getThread(email: string, threadId: string, maxBodyChars = 8000) {
  const t = await gmail<Thread>(email, `threads/${threadId}?format=full`);
  const messages: FullMessage[] = (t.messages ?? []).map((m) => {
    const plain = findBody(m.payload, "text/plain");
    const html = plain ? null : findBody(m.payload, "text/html");
    let body = plain ?? (html ? htmlToText(html) : m.snippet ?? "");
    if (body.length > maxBodyChars) body = body.slice(0, maxBodyChars) + "\n…[truncated]";
    return {
      messageId: m.id,
      from: header(m, "From"),
      to: header(m, "To"),
      cc: header(m, "Cc"),
      date: header(m, "Date"),
      subject: header(m, "Subject"),
      body,
      attachments: attachments(m.payload),
    };
  });
  return { account: email, threadId, messages };
}

export interface DraftInput {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body: string;
  threadId?: string; // set to draft a reply in an existing thread
  replyAll?: boolean;
}

export async function createDraft(email: string, input: DraftInput) {
  let { to, cc, subject } = input;
  const extra: string[] = [];

  if (input.threadId) {
    const meta = new URLSearchParams({ format: "metadata" });
    for (const h of ["From", "To", "Cc", "Reply-To", "Subject", "Message-ID", "References"]) meta.append("metadataHeaders", h);
    const t = await gmail<Thread>(email, `threads/${input.threadId}?${meta}`);
    // Reply to the latest message not sent by us, falling back to the latest message.
    const msgs = t.messages ?? [];
    const target =
      [...msgs].reverse().find((m) => !header(m, "From").toLowerCase().includes(email.toLowerCase())) ?? msgs[msgs.length - 1];
    if (target) {
      const msgId = header(target, "Message-ID");
      const refs = header(target, "References");
      if (msgId) {
        extra.push(`In-Reply-To: ${msgId}`);
        extra.push(`References: ${refs ? `${refs} ${msgId}` : msgId}`);
      }
      to ??= header(target, "Reply-To") || header(target, "From");
      if (input.replyAll && cc === undefined) {
        const others = [header(target, "To"), header(target, "Cc")]
          .join(",")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !s.toLowerCase().includes(email.toLowerCase()));
        if (others.length) cc = others.join(", ");
      }
      const orig = header(target, "Subject");
      subject ??= /^re:/i.test(orig) ? orig : `Re: ${orig}`;
    }
  }

  if (!to) throw new Error("A 'to' address is required for a new email.");

  const lines = [
    `From: ${email}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    input.bcc ? `Bcc: ${input.bcc}` : null,
    `Subject: ${encodeHeader(subject ?? "")}`,
    ...extra,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.body, "utf8").toString("base64"),
  ].filter((l): l is string => l !== null);

  const raw = b64urlEncode(lines.join("\r\n"));
  const draft = await gmail<{ id: string; message: { id: string; threadId: string } }>(email, "drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } }),
  });
  return { account: email, draftId: draft.id, threadId: draft.message.threadId, to, cc: cc ?? "", subject: subject ?? "" };
}

export async function listDrafts(email: string, max = 10) {
  const list = await gmail<{ drafts?: { id: string; message: { id: string; threadId: string } }[] }>(
    email,
    `drafts?maxResults=${Math.min(max, 50)}`,
  );
  return Promise.all(
    (list.drafts ?? []).map(async (d) => {
      const full = await gmail<{ id: string; message: Message }>(email, `drafts/${d.id}?format=metadata`);
      return {
        account: email,
        draftId: d.id,
        threadId: d.message.threadId,
        to: header(full.message, "To"),
        subject: header(full.message, "Subject"),
        snippet: full.message.snippet ?? "",
      };
    }),
  );
}

export async function sendDraft(email: string, draftId: string) {
  const sent = await gmail<{ id: string; threadId: string }>(email, "drafts/send", {
    method: "POST",
    body: JSON.stringify({ id: draftId }),
  });
  return { account: email, messageId: sent.id, threadId: sent.threadId };
}

const SYSTEM_LABELS = new Set(["INBOX", "UNREAD", "STARRED", "IMPORTANT", "SPAM", "TRASH", "SENT", "DRAFT"]);

export async function listLabels(email: string) {
  const res = await gmail<{ labels?: { id: string; name: string; type: string }[] }>(email, "labels");
  return res.labels ?? [];
}

async function resolveLabelIds(email: string, names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const needLookup = names.some((n) => !SYSTEM_LABELS.has(n.toUpperCase()));
  const labels = needLookup ? await listLabels(email) : [];
  return names.map((n) => {
    if (SYSTEM_LABELS.has(n.toUpperCase())) return n.toUpperCase();
    const match = labels.find((l) => l.name.toLowerCase() === n.toLowerCase() || l.id === n);
    if (!match) throw new Error(`Label not found in ${email}: ${n}`);
    return match.id;
  });
}

export async function modifyThread(email: string, threadId: string, add: string[] = [], remove: string[] = []) {
  const [addLabelIds, removeLabelIds] = await Promise.all([resolveLabelIds(email, add), resolveLabelIds(email, remove)]);
  await gmail(email, `threads/${threadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
  return { account: email, threadId, added: add, removed: remove };
}
