import { useState } from "react";
import type { Session } from "../api.ts";
import { DEFAULT_CLOCK_MIN, FRIEND_CLOCK_MINUTES, FRIEND_CODE_RE, MODE_RULES, type MatchMode, type MatchRule } from "../online/protocol.ts";
import { formatDate, t } from "../i18n/index.ts";
import { Fold } from "./Fold.tsx";

interface OnlinePanelProps {
  session: Session | null;
  waiting: { mode: MatchMode; code: string | null; rule?: MatchRule } | null;
  error: string | null;
  onFind: (mode: MatchMode, code: string | null, rule?: MatchRule, clockMin?: number) => void;
  onCancel: () => void;
  /** 이용 제한 끝나는 시각(ms) */
  bannedUntil?: number | null;
}

export function OnlinePanel({ session, waiting, error, onFind, onCancel, bannedUntil }: OnlinePanelProps) {
  const [code, setCode] = useState("");
  const [casualRule, setCasualRule] = useState<MatchRule>(MODE_RULES.casual[0]);
  const [friendRule, setFriendRule] = useState<MatchRule>(MODE_RULES.friend[0]);
  const [clockMin, setClockMin] = useState<number>(DEFAULT_CLOCK_MIN);
  const banned = !!bannedUntil && bannedUntil > Date.now();
  const ready = session?.verified && !banned;
  return (
    <Fold id="online" title={t("online.title")} label={t("online.title")} forceOpen={!!waiting}>
      {!session && <p className="muted">{t("online.loginFirst")}</p>}
      {session && !session.verified && <p className="muted">{t("online.verifyFirst")}</p>}
      {banned && <p className="form-error">{t("online.banned", { until: bannedUntil! > Date.now() + 3650 * 86_400_000 ? t("online.bannedForever") : formatDate(new Date(bannedUntil!).toISOString()) })}</p>}
      {waiting ? (
        <div className="waiting">
          <p className="waiting-text" aria-live="polite">
            <span className="spinner" aria-hidden /> {(() => {
              const parts = [waiting.code, waiting.mode !== "rated" && waiting.rule ? t(`online.rule.${waiting.rule}`) : null].filter(Boolean);
              return t("online.searching", { mode: t(`mode.${waiting.mode}`), code: parts.length ? ` (${parts.join(" · ")})` : "" });
            })()}
          </p>
          <button className="btn small ghost" onClick={onCancel}>{t("btn.cancel")}</button>
        </div>
      ) : (
        <>
          <div className="match-buttons">
            <button className="btn primary" disabled={!ready} onClick={() => onFind("rated", null)}>{t("mode.rated")}</button>
            <button className="btn" disabled={!ready} onClick={() => onFind("casual", null, casualRule)}>{t("mode.casual")}</button>
          </div>
          {/* 친선매치 규칙: 무작위 / 히든따목 / 지뢰따목 */}
          <select className="casual-rule" aria-label={t("online.casualRule")} value={casualRule} onChange={(e) => setCasualRule(e.target.value as MatchRule)} disabled={!ready}>
            {MODE_RULES.casual.map((r) => <option key={r} value={r}>{t(`online.rule.${r}`)}</option>)}
          </select>
          <form
            className="friend-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (FRIEND_CODE_RE.test(code)) onFind("friend", code, friendRule, clockMin);
            }}
          >
            <input
              aria-label={t("online.code")} placeholder={t("online.codePlaceholder")} inputMode="numeric" pattern="\d{1,8}" maxLength={8}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} disabled={!ready}
            />
            <button className="btn" type="submit" disabled={!ready || !FRIEND_CODE_RE.test(code)}>{t("mode.friend")}</button>
          </form>
          {/* 친구매치 규칙(히든따목/지뢰따목/따목) · 시간(1·2·3·5·10분) */}
          <div className="friend-options">
            <select className="friend-rule" aria-label={t("online.friendRule")} value={friendRule} onChange={(e) => setFriendRule(e.target.value as MatchRule)} disabled={!ready}>
              {MODE_RULES.friend.map((r) => <option key={r} value={r}>{t(`online.rule.${r}`)}</option>)}
            </select>
            <select className="friend-time" aria-label={t("online.clock")} value={clockMin} onChange={(e) => setClockMin(Number(e.target.value))} disabled={!ready}>
              {FRIEND_CLOCK_MINUTES.map((m) => <option key={m} value={m}>{t("online.minutes", { n: m })}</option>)}
            </select>
          </div>
          <p className="muted small-note">{t("online.note")}</p>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </Fold>
  );
}
