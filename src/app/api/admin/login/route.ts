import { NextResponse, type NextRequest } from "next/server";
import { getAdminCaller, localLogin, setLocalSession, supabaseServer, whoami } from "@/lib/server/auth";
import { isLocalMode } from "@/lib/server/env";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { sameOrigin } from "@/lib/server/http";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = clientIp(req.headers);
  let body: { email?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const email = (body.email ?? "").trim().toLowerCase().slice(0, 200);
  const password = (body.password ?? "").slice(0, 200);
  // brute-force protection: per IP and per account
  if (!rateLimit(`login:ip:${ip}`, 10, 15 * 60_000) || !rateLimit(`login:acct:${email}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!email || !password) return NextResponse.json({ error: "invalid" }, { status: 400 });

  if (isLocalMode()) {
    const id = await localLogin(email, password);
    if (!id) return NextResponse.json({ error: "invalid" }, { status: 401 });
    await setLocalSession(id);
  } else {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const caller = await getAdminCaller();
  if (!caller) return NextResponse.json({ error: "invalid" }, { status: 401 });
  const me = await whoami(caller).catch(() => null);
  // Explicit authorization: a valid Supabase account alone is not enough.
  if (!me?.profile_role) {
    if (!isLocalMode()) await (await supabaseServer()).auth.signOut();
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  let mfa: "none" | "verify" | "enroll" = "none";
  if (!isLocalMode()) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") mfa = "verify";
    else if (me.require_mfa && data?.currentLevel !== "aal2") mfa = "enroll";
  }
  return NextResponse.json({ ok: true, mfa });
}
