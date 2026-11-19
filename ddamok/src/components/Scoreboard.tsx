import type { GameState, Player } from "../game/index.ts";
export interface SeatLabel {
  name: string;
  rank?: string;
  /** 예: "1500?" */
  rating?: string;
  /** 접속 끊김: 패배까지 남은 초 */
  disconnectedSec?: number;
}

interface ScoreboardProps {
  state: GameState;
  names: Record<Player, SeatLabel | null>;
}

const LABEL: Record<Player, string> = { black: "흑", white: "백" };

export function Scoreboard({ state, names }: ScoreboardProps) {
  const justCaptured = state.lastCaptured.length;
  const mover: Player | null = state.lastMove ? state.board[state.lastMove.row][state.lastMove.col] : null;

  return (
    <div className="scoreboard">
      {(["black", "white"] as const).map((p) => {
        const count = p === "black" ? state.capturedByBlack : state.capturedByWhite;
        const target = state.config.captureTarget[p];
        const active = !state.isFinished && state.currentPlayer === p;
        const user = names[p];
        return (
          <div key={p} className={`score-card ${p}${active ? " is-turn" : ""}${state.winner === p ? " is-winner" : ""}`}>
            <div className="score-head">
              <span className={`dot ${p}`} aria-hidden />
              <span className="score-name">{user ? user.name : LABEL[p]}</span>
              {user?.rank && <span className="score-rank">{user.rank}</span>}
              {user?.rating && <span className="score-rating">{user.rating}</span>}
              {active && <span className="turn-tag">차례</span>}
            </div>
            <div className="score-count" aria-label={`${LABEL[p]} 따낸 돌 ${count}개, 승리 ${target}개`}>
              <span key={count} className="count bump">{count}</span>
              <span className="target">/ {target}</span>
              {mover === p && justCaptured > 0 && (
                <span key={`plus-${state.moveCount}`} className="plus">+{justCaptured}</span>
              )}
            </div>
            <div className="meter" aria-hidden>
              <span style={{ width: `${Math.min(100, (count / target) * 100)}%` }} />
            </div>
            {user?.disconnectedSec !== undefined && (
              <p className="disconnect-warn" role="status">연결 끊김 · {user.disconnectedSec}초 뒤 패배</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
