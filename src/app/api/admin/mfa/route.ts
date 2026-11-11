import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/server/auth";
import { isLocalMode } from "@/lib/server/env";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { sameOrigin } from "@/lib/server/http";

// TOTP MFA via Supabase Auth. Enroll → scan QR → verify. Login: verify with existing factor.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isLocalMode()) return NextResponse.json({ error: "mfa_unavailable_in_local_mode" }, { status: 400 });
  if (!rateLimit(`mfa:${clientIp(req.headers)}`, 10, 5 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const supabase = await supabaseServer();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; factorId?: string; code?: string };

  if (body.action === "status") {
    const { data } = await supabase.auth.mfa.listFactors();
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return NextResponse.json({ factors: (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })), aal: aal.data });
  }
  if (body.action === "enroll") {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  if (body.action === "verify") {
    let factorId = body.factorId;
    if (!factorId) {
      const { data } = await supabase.auth.mfa.listFactors();
      factorId = data?.totp?.[0]?.id;
    }
    if (!factorId || !/^\d{6}$/.test(body.code ?? "")) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: body.code! });
    if (error) return NextResponse.json({ error: "invalid_code" }, { status: 401 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
