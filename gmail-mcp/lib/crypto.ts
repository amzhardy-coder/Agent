import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function key(): Buffer {
  const k = Buffer.from(env.encryptionKey, "hex");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return k;
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Constant-time comparison against APP_SECRET. */
export function isValidSecret(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(env.appSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Value of the httpOnly admin cookie (derived from APP_SECRET, so the raw secret isn't stored). */
export const ADMIN_COOKIE = "gm_admin";
export function adminCookieValue(): string {
  return createHmac("sha256", env.appSecret).update("admin-session").digest("hex");
}
export function isAdminCookie(value: string | undefined): boolean {
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(adminCookieValue());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signed, expiring OAuth state so the callback can't be forged. */
export function signState(ttlSeconds = 600): string {
  const body = `${Date.now() + ttlSeconds * 1000}.${randomBytes(8).toString("hex")}`;
  const sig = createHmac("sha256", env.appSecret).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyState(state: string | null): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, sig] = parts;
  const expected = createHmac("sha256", env.appSecret).update(`${expires}.${nonce}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) && Number(expires) > Date.now();
}
