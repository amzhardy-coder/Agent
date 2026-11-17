// Minimal Supabase (PostgREST) client using fetch — no extra dependency.
import { env } from "./env";
import { decrypt, encrypt } from "./crypto";

export interface AccountRow {
  email: string;
  label: string | null;
  refresh_token: string; // encrypted
  created_at: string;
  updated_at: string;
}

export interface Account {
  email: string;
  label: string | null;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.supabaseServiceKey,
      Authorization: `Bearer ${env.supabaseServiceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

export async function listAccounts(): Promise<Account[]> {
  const res = await rest("gmail_accounts?select=email,label&order=created_at.asc");
  return (await res.json()) as Account[];
}

export async function getRefreshToken(email: string): Promise<string> {
  const res = await rest(`gmail_accounts?select=refresh_token&email=eq.${encodeURIComponent(email.toLowerCase())}`);
  const rows = (await res.json()) as Pick<AccountRow, "refresh_token">[];
  if (!rows.length) throw new Error(`Account not connected: ${email}`);
  return decrypt(rows[0].refresh_token);
}

export async function upsertAccount(email: string, refreshToken: string, label?: string | null): Promise<void> {
  const row: Record<string, unknown> = {
    email: email.toLowerCase(),
    refresh_token: encrypt(refreshToken),
    updated_at: new Date().toISOString(),
  };
  if (label !== undefined) row.label = label;
  await rest("gmail_accounts?on_conflict=email", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
}

export async function setLabel(email: string, label: string | null): Promise<void> {
  await rest(`gmail_accounts?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ label, updated_at: new Date().toISOString() }),
  });
}

export async function removeAccount(email: string): Promise<void> {
  await rest(`gmail_accounts?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}
