import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminCookie, isValidSecret } from "./crypto";

/** True if the request carries ?key=APP_SECRET or a valid admin cookie. */
export async function isAdmin(key?: string | null): Promise<boolean> {
  if (isValidSecret(key)) return true;
  const jar = await cookies();
  return isAdminCookie(jar.get(ADMIN_COOKIE)?.value);
}
