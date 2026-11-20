import type { Player } from "../game/index.ts";
import { formatRating, type RatingRow, type ResultReason } from "../online/protocol.ts";
import { colorName, displayName, rankName, t } from "../i18n/index.ts";
import { useState } from "react";
import { api, loadSession, REPORT_CATEGORIES, type ReportCategory } from "../api.ts";

export interface ResultView {
  /** 무승부면 null */
  winner: Player | null;
  reason: ResultReason;
  moveCount: number;
  /** 승자가 따낸 돌 수 */
  captured: number;
  names?: Record<Player, string>;
  ratings?: Record<Player, RatingRow>;
  upset?: boolean;
  /** 온라인 대국에서 내 색 */
  you?: Player;
  /** 온라인 대국 id(신고용) */
  gameId?: string;
}

interface GameResultProps {
  result: ResultView;
  canUndo: boolean;
  onNewGame: () => void;
  onUndo: () => void;
  onClose: () => void;
}

export function GameResult({ result: r, canUndo, onNewGame, onUndo, onClose }: GameResultProps) {
  const loser = colorName(r.winner === "black" ? "white" : "black");
  const reasonText =
    r.winner === null ? t("result.boardFull")
    : r.reason === "capture" ? t("result.capture", { n: r.captured })
      : r.reason === "five" ? t("result.five")
        : r.reason === "resign" ? t("result.resigned", { color: loser })
          : r.reason === "timeout" ? t("result.timedOut", { color: loser })
            : t("result.disconnected", { color: loser });
  const title = r.winner === null ? t("result.draw")
    : r.you ? (r.you === r.winner ? t("result.youWin") : t("result.youLose"))
      : t("result.colorWins", { color: colorName(r.winner) });

  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={`result-card ${r.winner ?? "draw"}`}>
        <div className={`result-badge ${r.reason}`}>{t(`reason.${r.reason}`)}</div>
        <h2 id="result-title">
          {r.winner && <span className={`dot big ${r.winner}`} aria-hidden />} {title}
        </h2>
        <p className="result-reason">{reasonText} · {t("result.moves", { n: r.moveCount })}</p>

        {r.ratings && (
          <div className="result-rated">
            {r.upset && <p className="upset">{t("result.upset")}</p>}
            {(["black", "white"] as const).map((p) => {
              const s = r.ratings![p];
              const d = s.after - s.before;
              return (
                <div key={p} className="rating-row">
                  <span className={`dot ${p}`} aria-hidden />
                  <span className="who">
                    {r.names ? <a href={`/profile?user=${encodeURIComponent(r.names[p])}`} target="_blank" rel="noopener">{displayName(r.names[p])}</a> : colorName(p)}
                  </span>
                  <span className="rank">{rankName(s.after)}</span>
                  <span className="pts">{formatRating(s.after, s.provisional)}</span>
                  <span className={`delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>
                    {d > 0 ? `+${d}` : d}
                    {s.bonus > 0 && <small> ({t("result.bonus", { n: s.bonus })})</small>}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {r.you && r.gameId && <ReportForm gameId={r.gameId} />}

        <div className="result-actions">
          <button className="btn primary" onClick={onNewGame}>{t("btn.newGame")}</button>
          {canUndo && <button className="btn" onClick={onUndo}>{t("btn.undo")}</button>}
          <button className="btn ghost" onClick={onClose}>{t("btn.viewBoard")}</button>
        </div>
      </div>
    </div>
  );
}

/** 대국 뒤 상대 신고: 종류 + 사유(꼭) */
function ReportForm({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("ai");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") return <p className="muted small-note">{t("report.done")}</p>;
  if (!open) return <button className="btn small ghost report-open" onClick={() => setOpen(true)}>{t("report.button")}</button>;
  return (
    <form
      className="report-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const s = loadSession();
        if (!s) return;
        setState("busy");
        setError(null);
        try {
          await api.report(s.token, gameId, category, reason.trim());
          setState("done");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setState("idle");
        }
      }}
    >
      <select aria-label={t("report.category")} value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
        {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`report.cat.${c}`)}</option>)}
      </select>
      <textarea aria-label={t("report.reason")} placeholder={t("report.reason")} maxLength={500} rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="seat-buttons">
        <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>{t("btn.cancel")}</button>
        <button type="submit" className="btn small danger" disabled={state === "busy" || !reason.trim()}>{t("report.submit")}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
