// Google redirects here after consent. Stores the encrypted refresh token.
import { NextResponse, type NextRequest } from "next/server";
import { verifyState } from "@/lib/crypto";
import { isAdmin } from "@/lib/admin";
import { exchangeCode, forgetToken } from "@/lib/google";
import { profileFromToken } from "@/lib/gmail";
import { upsertAccount } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const back = (msg: string) => NextResponse.redirect(`${env.appUrl}/accounts?msg=${encodeURIComponent(msg)}`);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (!verifyState(p.get("state")) || !(await isAdmin())) return new NextResponse("Invalid or expired sign-in. Start again from /accounts.", { status: 400 });
  if (p.get("error")) return back(`Google sign-in cancelled: ${p.get("error")}`);

  const code = p.get("code");
  if (!code) return back("No authorization code returned.");

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      return back(
        "Google didn't return a refresh token. Remove this app at myaccount.google.com/permissions for that account, then connect again.",
      );
    }
    const { emailAddress } = await profileFromToken(tokens.access_token);
    const label = req.cookies.get("gm_pending_label")?.value || null;
    await upsertAccount(emailAddress, tokens.refresh_token, label);
    forgetToken(emailAddress);

    const res = back(`Connected ${emailAddress}`);
    res.cookies.delete("gm_pending_label");
    return res;
  } catch (e) {
    return back(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
