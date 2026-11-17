// Google OAuth: consent URL, code exchange, and cached access tokens per account.
import { env, redirectUri } from "./env";
import { getRefreshToken } from "./db";

// gmail.modify = read, label, archive, draft and send (no permanent delete).
export const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

export function consentUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
}

// Warm-instance cache: email -> { token, expiresAt }
const cache = new Map<string, { token: string; expiresAt: number }>();

export async function accessTokenFor(email: string): Promise<string> {
  const key = email.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const refresh = await getRefreshToken(key);
  const t = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  cache.set(key, { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

export function forgetToken(email: string) {
  cache.delete(email.toLowerCase());
}
