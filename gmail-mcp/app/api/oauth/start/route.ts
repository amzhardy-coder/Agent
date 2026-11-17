// Starts Google sign-in for one Gmail account.
// GET /api/oauth/start?label=Work[&hint=me@gmail.com]   (admin cookie or ?key= required)
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminCookieValue, signState } from "@/lib/crypto";
import { isAdmin } from "@/lib/admin";
import { consentUrl } from "@/lib/google";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!(await isAdmin(key))) return new NextResponse("Unauthorized", { status: 401 });

  const label = (req.nextUrl.searchParams.get("label") ?? "").trim().slice(0, 40);
  const hint = req.nextUrl.searchParams.get("hint") ?? undefined;

  const res = NextResponse.redirect(consentUrl(signState(), hint));
  const secure = req.nextUrl.protocol === "https:";
  res.cookies.set(ADMIN_COOKIE, adminCookieValue(), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  res.cookies.set("gm_pending_label", label, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
