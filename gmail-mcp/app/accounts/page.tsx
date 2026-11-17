import { isAdmin } from "@/lib/admin";
import { listAccounts } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;

  if (!(await isAdmin())) {
    return (
      <main>
        <h1>Gmail accounts</h1>
        <p>Locked. Open <code>/api/login?key=YOUR_APP_SECRET</code> once on this device to unlock.</p>
      </main>
    );
  }

  const accounts = await listAccounts();

  return (
    <main>
      <h1>Gmail accounts</h1>
      {msg && <p className="msg">{msg}</p>}

      {accounts.length === 0 ? (
        <p>No accounts connected yet.</p>
      ) : (
        <ul className="list">
          {accounts.map((a) => (
            <li key={a.email}>
              <div>
                <strong>{a.label || "—"}</strong>
                <span className="muted">{a.email}</span>
              </div>
              <form action="/api/accounts/remove" method="post">
                <input type="hidden" name="email" value={a.email} />
                <button type="submit" className="danger">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2>Connect an account</h2>
      <form action="/api/oauth/start" method="get" className="connect">
        <input name="label" placeholder="Nickname, e.g. Work, Personal, Maytria" maxLength={40} required />
        <button type="submit">Connect Gmail</button>
      </form>
      <p className="muted small">
        Reconnecting an account that's already listed updates its nickname and refreshes its access.
      </p>
    </main>
  );
}
