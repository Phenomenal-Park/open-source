import type { GameState, Player } from "../game/index.ts";
export interface SeatLabel {
  name: string;
  rank?: string;
  /** 예: "1500?" */
  rating?: string;
  /** 접속 끊김: 패배까지 남은 초 */
  disconnectedSec?: number;
  /** 대국 시계: 남은 시간(ms), 지금 줄어드는 중인가 */
  clock?: { ms: number; running: boolean };
}

/** 2:58 · 0:09 */
const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

interface ScoreboardProps {
  state: GameState;
  names: Record<Player, SeatLabel | null>;
}

import { colorName, t } from "../i18n/index.ts";

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
              <span className="score-name">{user ? user.name : colorName(p)}</span>
              {user?.rank && <span className="score-rank">{user.rank}</span>}
              {user?.rating && <span className="score-rating">{user.rating}</span>}
              {p === "white" && state.hidden && state.hidden.index >= 0 && !state.hidden.revealed && <span className="hidden-tag">{t("hidden.badge")}</span>}
              {active && <span className="turn-tag">{t("score.turn")}</span>}
            </div>
            <div className="score-count" aria-label={t("score.aria", { color: colorName(p), count, target })}>
              <span key={count} className="count bump">{count}</span>
              <span className="target">/ {target}</span>
              {mover === p && justCaptured > 0 && (
                <span key={`plus-${state.moveCount}`} className="plus">+{justCaptured}</span>
              )}
              {user?.clock && (
                <span className={`clock${user.clock.running ? " on" : ""}${user.clock.ms <= 10_000 ? " low" : ""}`} aria-label={t("online.clock")}>
                  {fmtClock(user.clock.ms)}
                </span>
              )}
            </div>
            <div className="meter" aria-hidden>
              <span style={{ width: `${Math.min(100, (count / target) * 100)}%` }} />
            </div>
            {user?.disconnectedSec !== undefined && (
              <p className="disconnect-warn" role="status">{t("score.disconnected", { sec: user.disconnectedSec })}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
