"use client";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";

// TOTP enrollment (Supabase Auth MFA). With app_settings.require_mfa = true, admin RPCs require AAL2.
export default function SecurityPage() {
  const [status, setStatus] = useState<{ factors: { id: string; status: string }[]; aal: { currentLevel: string } } | null>(null);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const post = (body: unknown) => fetch("/api/admin/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, j: await r.json() }));
  useEffect(() => { post({ action: "status" }).then(({ ok, j }) => (ok ? setStatus(j) : setMsg(j.error === "mfa_unavailable_in_local_mode" ? "로컬 개발 모드에서는 2단계 인증을 사용할 수 없어요." : "상태를 불러오지 못했어요."))); }, []);
  const verified = status?.factors.some((f) => f.status === "verified");
  return (
    <div className="app">
      <AdminHeader badge={<span className="tag">보안</span>} />
      <main className="page">
        <h2 className="section__title" style={{ marginTop: 16 }}>2단계 인증 (TOTP)</h2>
        {msg && <p>{msg}</p>}
        {status && <p>현재 세션 수준: <b>{status.aal?.currentLevel}</b> · 인증 앱 {verified ? "등록됨" : "미등록"}</p>}
        {status && !verified && !enroll && (
          <button className="btn btn--primary" onClick={async () => { const { ok, j } = await post({ action: "enroll" }); if (ok) setEnroll(j); else setMsg(j.error); }}>인증 앱 등록</button>
        )}
        {enroll && (
          <div className="card">
            <p>인증 앱으로 QR 코드를 스캔한 뒤 6자리 코드를 입력하세요.</p>
            <img src={enroll.qr} alt="TOTP QR" width={180} height={180} style={{ background: "#fff" }} />
            <p className="small muted">수동 입력: <code>{enroll.secret}</code></p>
            <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn--primary btn--block" style={{ marginTop: 10 }} onClick={async () => {
              const { ok } = await post({ action: "verify", factorId: enroll.factorId, code });
              if (ok) { setEnroll(null); setMsg("등록 완료"); const s = await post({ action: "status" }); setStatus(s.j); } else setMsg("코드가 올바르지 않아요");
            }}>확인</button>
          </div>
        )}
      </main>
    </div>
  );
}
