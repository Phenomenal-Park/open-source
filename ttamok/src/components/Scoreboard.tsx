import type { GameState, Player } from "../game/index.ts";
import type { PublicUser } from "../api.ts";

interface ScoreboardProps {
  state: GameState;
  names: Record<Player, PublicUser | null>;
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
              <span className="score-name">{user ? user.username : LABEL[p]}</span>
              {user && <span className="score-rank">{user.rank}</span>}
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
          </div>
        );
      })}
    </div>
  );
}
