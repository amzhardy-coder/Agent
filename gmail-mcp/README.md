# gmail-multi-mcp

A private MCP connector that gives Claude access to **several Gmail accounts at once**. It runs on Vercel and keeps each account's Google refresh token AES-256-GCM encrypted in Supabase.

## Tools Claude gets

| Tool | What it does |
|---|---|
| `list_accounts` | Every connected inbox, with its nickname |
| `search_email` | Gmail search across **all** accounts (or the ones you name) |
| `read_thread` | Full text of a thread |
| `create_draft` | New email or threaded reply, drafted in the right account (never sends) |
| `list_drafts` | Recent drafts |
| `send_draft` | Sends a draft. Claude is told to call it only after you approve |
| `update_labels` | Archive, mark read, star, or apply custom labels |
| `list_labels` | Labels in an account |

Accounts can be referred to by email or nickname ("Work", "Personal").

---

## Setup (about 30 minutes, once)

### 1. Supabase
Use a **new** Supabase project (recommended, so this stays separate from Maytria's database) or an existing one.
1. Run `supabase/migrations/001_gmail_accounts.sql` in the SQL editor.
2. Copy the **Project URL** and the **service_role key** (Settings → API).

### 2. Generate two secrets
```bash
openssl rand -hex 32   # APP_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
```
Keep them in a password manager. If you lose `ENCRYPTION_KEY`, you'll have to reconnect every account.

### 3. Deploy to Vercel
1. Import this repo in Vercel and set **Root Directory** to `gmail-mcp`. Vercel detects Next.js on its own.
2. Note the production URL, e.g. `https://gmail-multi-mcp.vercel.app`.

### 4. Google Cloud OAuth app
1. Go to <https://console.cloud.google.com/>, create a project (e.g. "Claude Gmail"), and enable the **Gmail API**.
2. Open **Google Auth Platform → Branding**, set the app name and your email.
3. Under **Audience**, set User type to **External** and add each Gmail address under **Test users**.
4. Under **Data Access**, add the scope `https://www.googleapis.com/auth/gmail.modify`.
5. Under **Clients**, create a client of type **Web application** with this authorized redirect URI:
   `https://<your-vercel-url>/api/oauth/callback`
6. Copy the **Client ID** and **Client secret**.

> Refresh tokens for apps in **Testing** mode expire after 7 days. To stop that, go to **Audience → Publish app**. Google will show an "unverified app" warning on sign-in. For your own accounts you can click *Advanced → Go to app*. Verification is only needed if other people will use it.

### 5. Vercel environment variables
Add everything in `.env.example` to Vercel (Settings → Environment Variables), then **redeploy**:
`APP_URL`, `APP_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### 6. Connect your Gmail accounts
1. Open `https://<your-vercel-url>/api/login?key=<APP_SECRET>` once. This unlocks the accounts page on that device.
2. On `/accounts`, enter a nickname and click **Connect Gmail**. Repeat for each account.

### 7. Add it to Claude
In claude.ai, go to **Settings → Connectors → Add custom connector** and use:
```
https://<your-vercel-url>/api/mcp?key=<APP_SECRET>
```
Then enable it in your "AI agent" Project. If the built-in Gmail connector is also on, turn it off in that Project so Claude doesn't mix them up.

---

## Security notes
- The `APP_SECRET` in the connector URL works like a password. Don't share the URL. To rotate it, change `APP_SECRET` in Vercel, redeploy, and update the connector.
- Tokens are encrypted before storage. The table has RLS on with no policies, so only the service-role key can read it.
- The `gmail.modify` scope can read, draft, send, label and trash mail, but **not** permanently delete it.
- To revoke an account fully, click Remove on `/accounts` **and** remove the app at <https://myaccount.google.com/permissions>.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in; APP_URL=http://localhost:3000
npm run dev
```
For local testing, add `http://localhost:3000/api/oauth/callback` as a second redirect URI in Google Cloud.
