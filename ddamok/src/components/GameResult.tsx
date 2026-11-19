import type { Player } from "../game/index.ts";
import { formatRating, type RatingRow, type ResultReason } from "../online/protocol.ts";
import { colorName, displayName, rankName, t } from "../i18n/index.ts";

export interface ResultView {
  winner: Player;
  reason: ResultReason;
  moveCount: number;
  /** 승자가 따낸 돌 수 */
  captured: number;
  names?: Record<Player, string>;
  ratings?: Record<Player, RatingRow>;
  upset?: boolean;
  /** 온라인 대국에서 내 색 */
  you?: Player;
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
    r.reason === "capture" ? t("result.capture", { n: r.captured })
      : r.reason === "five" ? t("result.five")
        : r.reason === "resign" ? t("result.resigned", { color: loser })
          : t("result.disconnected", { color: loser });
  const title = r.you ? (r.you === r.winner ? t("result.youWin") : t("result.youLose")) : t("result.colorWins", { color: colorName(r.winner) });

  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={`result-card ${r.winner}`}>
        <div className={`result-badge ${r.reason}`}>{t(`reason.${r.reason}`)}</div>
        <h2 id="result-title">
          <span className={`dot big ${r.winner}`} aria-hidden /> {title}
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
                  <span className="who">{r.names ? displayName(r.names[p]) : colorName(p)}</span>
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

        <div className="result-actions">
          <button className="btn primary" onClick={onNewGame}>{t("btn.newGame")}</button>
          {canUndo && <button className="btn" onClick={onUndo}>{t("btn.undo")}</button>}
          <button className="btn ghost" onClick={onClose}>{t("btn.viewBoard")}</button>
        </div>
      </div>
    </div>
  );
}
