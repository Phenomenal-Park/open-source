import { useState, type FormEvent } from "react";
import { api, ApiError, saveSession, type Session } from "../api.ts";
import { errorText, t } from "../i18n/index.ts";

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
      setError(e instanceof ApiError ? e.message : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  const sentNote = (r: { devCode?: string; mailError?: string }) =>
    setNotice(r.mailError ? errorText(r.mailError, t("err.mail")) : r.devCode ? t("auth.devCode", { code: r.devCode }) : t("auth.sent"));

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
        <p className="muted">{t("auth.verifyHelp")}</p>
        <input aria-label={t("auth.code")} placeholder={t("auth.codePlaceholder")} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, "") })} required />
        <div className="seat-buttons">
          <button className="btn small primary" type="submit" disabled={busy}>{t("auth.verify")}</button>
          <button className="btn small" type="button" disabled={busy} onClick={() => run(async () => sentNote(await api.resend(session.token)))}>{t("auth.resend")}</button>
        </div>
        {notice && <p className="muted notice">{notice}</p>}
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
        <input aria-label={t("auth.loginId")} placeholder={t("auth.loginId")} autoComplete="username" value={f.login} onChange={set("login")} required />
        <input aria-label={t("auth.password")} placeholder={t("auth.password")} type="password" autoComplete="current-password" value={f.password} onChange={set("password")} required />
        <div className="seat-buttons">
          <button className="btn small primary" type="submit" disabled={busy}>{t("auth.login")}</button>
          <button className="btn small" type="button" onClick={() => { setMode("signup"); setError(null); }}>{t("auth.signup")}</button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>
    );
  }

  const [before, after] = t("auth.consent").split("{privacy}");
  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const r = await api.signup(f.username, f.email, f.password, f.over14);
          sentNote(r);
          done({ token: r.token, user: r.user, verified: false });
        });
      }}
    >
      <input aria-label={t("auth.nickname")} placeholder={t("auth.nicknamePlaceholder")} autoComplete="nickname" maxLength={16} value={f.username} onChange={set("username")} required />
      <input aria-label={t("auth.email")} placeholder={t("auth.email")} type="email" autoComplete="email" value={f.email} onChange={set("email")} required />
      <input aria-label={t("auth.password")} placeholder={t("auth.passwordPlaceholder")} type="password" autoComplete="new-password" minLength={6} maxLength={72} value={f.password} onChange={set("password")} required />
      <label className="check">
        <input type="checkbox" checked={f.over14} onChange={set("over14")} required /> <span>{before}<a href="/privacy">{t("auth.privacy")}</a>{after}</span>
      </label>
      <div className="seat-buttons">
        <button className="btn small primary" type="submit" disabled={busy}>{t("auth.signupSubmit")}</button>
        <button className="btn small" type="button" onClick={() => { setMode("login"); setError(null); }}>{t("auth.toLogin")}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
