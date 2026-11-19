import { useState } from "react";
import type { Session } from "../api.ts";
import { FRIEND_CODE_RE, type MatchMode } from "../online/protocol.ts";
import { t } from "../i18n/index.ts";

interface OnlinePanelProps {
  session: Session | null;
  waiting: { mode: MatchMode; code: string | null } | null;
  error: string | null;
  onFind: (mode: MatchMode, code: string | null) => void;
  onCancel: () => void;
}

export function OnlinePanel({ session, waiting, error, onFind, onCancel }: OnlinePanelProps) {
  const [code, setCode] = useState("");
  const ready = session?.verified;
  return (
    <section className="panel" aria-label={t("online.title")}>
      <h2>{t("online.title")}</h2>
      {!session && <p className="muted">{t("online.loginFirst")}</p>}
      {session && !session.verified && <p className="muted">{t("online.verifyFirst")}</p>}
      {waiting ? (
        <div className="waiting">
          <p className="waiting-text" aria-live="polite">
            <span className="spinner" aria-hidden /> {t("online.searching", { mode: t(`mode.${waiting.mode}`), code: waiting.code ? ` (${waiting.code})` : "" })}
          </p>
          <button className="btn small ghost" onClick={onCancel}>{t("btn.cancel")}</button>
        </div>
      ) : (
        <>
          <div className="match-buttons">
            <button className="btn primary" disabled={!ready} onClick={() => onFind("rated", null)}>{t("mode.rated")}</button>
            <button className="btn" disabled={!ready} onClick={() => onFind("casual", null)}>{t("mode.casual")}</button>
          </div>
          <form
            className="friend-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (FRIEND_CODE_RE.test(code)) onFind("friend", code);
            }}
          >
            <input
              aria-label={t("online.code")} placeholder={t("online.codePlaceholder")} inputMode="numeric" pattern="\d{1,8}" maxLength={8}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!ready}
            />
            <button className="btn" type="submit" disabled={!ready || !FRIEND_CODE_RE.test(code)}>{t("mode.friend")}</button>
          </form>
          <p className="muted small-note">{t("online.note")}</p>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
