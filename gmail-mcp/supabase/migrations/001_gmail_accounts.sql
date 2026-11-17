-- Stores one row per connected Gmail account.
-- refresh_token is AES-256-GCM encrypted by the app before it is written.
create table if not exists public.gmail_accounts (
  email          text primary key,
  label          text,
  refresh_token  text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Lock the table down: RLS on, no policies.
-- Only the service role key (used server-side by the connector) can read or write it.
alter table public.gmail_accounts enable row level security;
revoke all on public.gmail_accounts from anon, authenticated;
