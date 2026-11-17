// POST (form) email=... — disconnects an account and deletes its stored token.
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { removeAccount } from "@/lib/db";
import { forgetToken } from "@/lib/google";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const email = String((await req.formData()).get("email") ?? "");
  if (email) {
    await removeAccount(email);
    forgetToken(email);
  }
  // 303 so the browser follows with GET
  return NextResponse.redirect(`${env.appUrl}/accounts?msg=${encodeURIComponent(`Removed ${email}`)}`, 303);
}
