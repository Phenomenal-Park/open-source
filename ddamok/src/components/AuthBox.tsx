import { useState, type FormEvent } from "react";
import { api, ApiError, saveSession, type Session } from "../api.ts";

interface AuthBoxProps {
  session: Session | null;
  onSession: (s: Session | null) => void;
}

/** 로그인 / 가입(닉네임·이메일·비밀번호·만 14세) / 이메일 인증 */
export function AuthBox({ session, onSession }: AuthBoxProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [f, setF] = useState({ login: "", username: "", email: "", password: "", over14: false, code: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const done = (s: Session | null) => {
    saveSession(s);
    onSession(s);
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "오류가 났습니다.");
    } finally {
      setBusy(false);
    }
  }

  const devNote = (r: { devCode?: string; mailError?: string }) =>
    setNotice(r.mailError ?? (r.devCode ? `개발용 서버: 인증 코드 ${r.devCode}` : "인증 코드를 이메일로 보냈습니다."));

  if (session && !session.verified) {
    return (
      <form
        className="auth-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(async () => {
            await api.verify(session.token, f.code.trim());
            done({ ...session, verified: true });
          });
        }}
      >
        <p className="muted">가입한 이메일로 받은 6자리 인증 코드를 입력하세요. 인증해야 온라인 대국을 둘 수 있습니다.</p>
        <input aria-label="인증 코드" placeholder="인증 코드 6자리" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, "") })} required />
        <div className="seat-buttons">
          <button className="btn small primary" type="submit" disabled={busy}>인증</button>
          <button className="btn small" type="button" disabled={busy} onClick={() => run(async () => devNote(await api.resend(session.token)))}>코드 다시 받기</button>
        </div>
        {notice && <p className="muted">{notice}</p>}
        {error && <p className="form-error">{error}</p>}
      </form>
    );
  }

  if (mode === "login") {
    return (
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await api.login(f.login, f.password);
            done({ token: r.token, user: r.user, verified: r.verified });
          });
        }}
      >
        <input aria-label="이메일 또는 닉네임" placeholder="이메일 또는 닉네임" autoComplete="username" value={f.login} onChange={set("login")} required />
        <input aria-label="비밀번호" placeholder="비밀번호" type="password" autoComplete="current-password" value={f.password} onChange={set("password")} required />
        <div className="seat-buttons">
          <button className="btn small primary" type="submit" disabled={busy}>로그인</button>
          <button className="btn small" type="button" onClick={() => { setMode("signup"); setError(null); }}>가입</button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>
    );
  }

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const r = await api.signup(f.username, f.email, f.password, f.over14);
          devNote(r);
          done({ token: r.token, user: r.user, verified: false });
        });
      }}
    >
      <input aria-label="닉네임" placeholder="닉네임 (한글·영문·숫자 2~16자)" autoComplete="nickname" maxLength={16} value={f.username} onChange={set("username")} required />
      <input aria-label="이메일" placeholder="이메일" type="email" autoComplete="email" value={f.email} onChange={set("email")} required />
      <input aria-label="비밀번호" placeholder="비밀번호 (6자 이상)" type="password" autoComplete="new-password" minLength={6} maxLength={72} value={f.password} onChange={set("password")} required />
      <label className="check">
        <input type="checkbox" checked={f.over14} onChange={set("over14")} required /> 만 14세 이상이며 <a href="/privacy">개인정보 처리방침</a>에 동의합니다
      </label>
      <div className="seat-buttons">
        <button className="btn small primary" type="submit" disabled={busy}>가입하고 인증 코드 받기</button>
        <button className="btn small" type="button" onClick={() => { setMode("login"); setError(null); }}>로그인으로</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
