// GET /api/login?key=APP_SECRET — sets the admin cookie, then opens /accounts.
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminCookieValue, isValidSecret } from "@/lib/crypto";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isValidSecret(req.nextUrl.searchParams.get("key"))) return new NextResponse("Unauthorized", { status: 401 });
  const res = NextResponse.redirect(`${env.appUrl}/accounts`);
  res.cookies.set(ADMIN_COOKIE, adminCookieValue(), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
