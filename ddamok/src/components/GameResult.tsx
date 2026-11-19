import type { Player } from "../game/index.ts";
import { formatRating, type RatingRow, type ResultReason } from "../online/protocol.ts";

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

const LABEL: Record<Player, string> = { black: "흑", white: "백" };
const REASON: Record<ResultReason, string> = { five: "오목", capture: "따내기", resign: "기권", disconnect: "연결 끊김" };

export function GameResult({ result: r, canUndo, onNewGame, onUndo, onClose }: GameResultProps) {
  const reasonText =
    r.reason === "capture" ? `따내기 승 · ${r.captured}개`
      : r.reason === "five" ? "오목 승"
        : r.reason === "resign" ? `${LABEL[r.winner === "black" ? "white" : "black"]} 기권`
          : `${LABEL[r.winner === "black" ? "white" : "black"]} 연결 끊김`;
  const title = r.you ? (r.you === r.winner ? "승리!" : "패배") : `${LABEL[r.winner]} 승리`;

  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={`result-card ${r.winner}`}>
        <div className={`result-badge ${r.reason}`}>{REASON[r.reason]}</div>
        <h2 id="result-title">
          <span className={`dot big ${r.winner}`} aria-hidden /> {title}
        </h2>
        <p className="result-reason">{reasonText} · {r.moveCount}수</p>

        {r.ratings && (
          <div className="result-rated">
            {r.upset && <p className="upset">고단자 이변!</p>}
            {(["black", "white"] as const).map((p) => {
              const s = r.ratings![p];
              const d = s.after - s.before;
              return (
                <div key={p} className="rating-row">
                  <span className={`dot ${p}`} aria-hidden />
                  <span className="who">{r.names?.[p] ?? LABEL[p]}</span>
                  <span className="rank">{s.rank}</span>
                  <span className="pts">{formatRating(s.after, s.provisional)}</span>
                  <span className={`delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>
                    {d > 0 ? `+${d}` : d}
                    {s.bonus > 0 && <small> (보너스 {s.bonus})</small>}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="result-actions">
          <button className="btn primary" onClick={onNewGame}>새 대국</button>
          {canUndo && <button className="btn" onClick={onUndo}>무르기</button>}
          <button className="btn ghost" onClick={onClose}>판 보기</button>
        </div>
      </div>
    </div>
  );
}
