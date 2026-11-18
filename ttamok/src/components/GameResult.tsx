import type { GameState, Player } from "../game/index.ts";
import type { RatedResult } from "../api.ts";

interface GameResultProps {
  state: GameState;
  rated: { status: "submitting" | "done" | "error"; result?: RatedResult; error?: string } | null;
  canUndo: boolean;
  onNewGame: () => void;
  onUndo: () => void;
  onClose: () => void;
}

const LABEL: Record<Player, string> = { black: "흑", white: "백" };

export function GameResult({ state, rated, canUndo, onNewGame, onUndo, onClose }: GameResultProps) {
  if (!state.winner) return null;
  const w = state.winner;
  const reason =
    state.winReason === "capture"
      ? `따내기 승 · ${w === "black" ? state.capturedByBlack : state.capturedByWhite}개`
      : "오목 승";

  return (
    <div className="result-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className={`result-card ${w}`}>
        <div className={`result-badge ${state.winReason}`}>{state.winReason === "capture" ? "따내기" : "오목"}</div>
        <h2 id="result-title">
          <span className={`dot big ${w}`} aria-hidden /> {LABEL[w]} 승리
        </h2>
        <p className="result-reason">{reason} · {state.moveCount}수</p>

        {rated?.status === "submitting" && <p className="result-rated">점수 반영 중…</p>}
        {rated?.status === "error" && <p className="result-rated error">{rated.error}</p>}
        {rated?.status === "done" && rated.result && (
          <div className="result-rated">
            {rated.result.upset && <p className="upset">고단자 이변!</p>}
            {(["black", "white"] as const).map((p) => {
              const s = rated.result![p];
              const d = s.after - s.before;
              return (
                <div key={p} className="rating-row">
                  <span className={`dot ${p}`} aria-hidden />
                  <span className="who">{s.user.username}</span>
                  <span className="rank">{s.user.rank}</span>
                  <span className="pts">{s.after}</span>
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
