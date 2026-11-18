export const metadata = { title: "Privacy Policy — Claude Gmail Connector" };

export default function Privacy() {
  return (
    <main>
      <h1>Privacy Policy</h1>
      <p className="muted small">Last updated: November 18, 2026</p>

      <p>
        Claude Gmail Connector is a private tool operated by BridgePointe Solutions LLC for its owner's own Gmail
        accounts. It is not offered to the public.
      </p>

      <h2>What it accesses</h2>
      <p>
        With your permission (Google scope <code>gmail.modify</code>), the connector reads, searches, labels and drafts
        email, and sends drafts only when you approve them, in the Gmail accounts you connect.
      </p>

      <h2>What it stores</h2>
      <p>
        Only each account's email address, a nickname you choose, and an encrypted Google refresh token. Email content is
        not stored; it is fetched on request and passed to the owner's Claude assistant.
      </p>

      <h2>Sharing</h2>
      <p>
        Data is not sold or shared with third parties, and is not used for advertising or to train AI models. Use of
        information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited
        Use requirements.
      </p>

      <h2>Removing access</h2>
      <p>
        Remove an account on the accounts page to delete its stored token, and revoke access at
        myaccount.google.com/permissions.
      </p>

      <h2>Contact</h2>
      <p>andrea@bridgepointesolutions.net</p>
    </main>
  );
}
