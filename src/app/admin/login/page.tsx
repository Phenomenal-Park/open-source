"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { status, j } = await post("/api/admin/login", { email, password });
    setBusy(false);
    if (status === 429) return setErr("시도가 너무 많아요. 15분 후 다시 시도해 주세요.");
    if (status === 403) return setErr("관리자 권한이 없는 계정이에요.");
    if (status !== 200) return setErr("이메일 또는 비밀번호가 올바르지 않아요.");
    if (j.mfa === "verify") return setStep("mfa");
    window.location.href = j.mfa === "enroll" ? "/admin/security" : "/admin/field";
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { status } = await post("/api/admin/mfa", { action: "verify", code });
    setBusy(false);
    if (status !== 200) return setErr("인증 코드가 올바르지 않아요.");
    window.location.href = "/admin/field";
  };

  return (
    <main className="page" style={{ maxWidth: 400, paddingTop: 48 }}>
      <h1 style={{ fontSize: 22 }}>관리자 로그인</h1>
      {step === "password" ? (
        <form onSubmit={login}>
          <div className="field"><label htmlFor="email">이메일</label><input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="pw">비밀번호</label><input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {err && <p role="alert" style={{ color: "var(--danger)" }}>{err}</p>}
          <button className="btn btn--primary btn--block" style={{ marginTop: 18 }} disabled={busy}>로그인</button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p>인증 앱의 6자리 코드를 입력해 주세요.</p>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          {err && <p role="alert" style={{ color: "var(--danger)" }}>{err}</p>}
          <button className="btn btn--primary btn--block" style={{ marginTop: 18 }} disabled={busy}>확인</button>
        </form>
      )}
    </main>
  );
}
