// 백 히든 규칙용 AI 판단.
// - 백: 숨겨 둘지 말지. 후보 수마다 "보이게 둘 때 / 숨겨 둘 때"를 흑의 반응(숨은 돌을 빈칸으로 보는 AI)까지 흉내 내 비교한다.
//   (흑이 그 자리를 누르면 드러나고 흑이 다시 두는 것까지 흉내 낸다.) 약한 단계는 가끔 무작위로 숨긴다.
// - 흑: 숨은 돌이 있다는 것만 안다. "백 돌이 거기 있으면 백이 바로 이기는" 빈칸이 있으면 그 자리를 눌러 본다
//   — 숨은 돌이면 드러나고(차례 유지) 아니면 그 줄을 막는 수가 되어 손해가 없다.
import { canUseHidden, tryMove, viewFor, type GameState, type Position } from "../game/index.ts";
import { FastBoard } from "./fast.ts";
import { fastChooseMove, FastSearcher, type FastLevel } from "./fastSearch.ts";
import type { AiLevel } from "./levels.ts";
import { chooseMove } from "./search.ts";

const SIM: FastLevel = { depth: 4, timeMs: 30, width: 10, noise: 0, randomPick: 0, randomPool: 1, missWin: 0, focus: 1 };
type Rng = () => number;
const toPos = (p: number, n: number): Position => ({ row: (p / n) | 0, col: p % n });

/** 흑이 숨은 돌이 있다고 알고 있을 때 눌러 볼 자리(없으면 null). `view`는 흑에게 보이는 판 */
export function blackProbe(view: GameState): Position | null {
  const h = view.hidden;
  if (!h || h.revealed || view.isFinished || view.currentPlayer !== "black") return null;
  const b = FastBoard.fromState(view);
  if (b.winningMoves(1).length || b.winningMoves(2).length) return null; // 급한 수가 먼저
  let best = -1, bestK = 0;
  for (let c = 0; c < b.cells.length; c++) {
    if (b.cells[c]) continue;
    b.cells[c] = 2;
    const k = b.winningMoves(2).length;
    b.cells[c] = 0;
    if (k > bestK) { bestK = k; best = c; }
  }
  return best >= 0 ? toPos(best, b.n) : null;
}

/** 흑 AI의 수: 보이는 판으로만 생각한다 */
export function chooseBlackMove(view: GameState, level: AiLevel, rand: Rng = Math.random): Position {
  const m = chooseMove(view, level, rand);
  const won = tryMove(view, m);
  if (won.ok && won.state.isFinished) return m;
  return blackProbe(view) ?? m;
}

/** 흑의 반응 흉내(보이는 판으로 고르고, 숨은 돌을 누르면 드러난 판으로 다시 고른다) */
function simulateBlack(s: GameState): GameState {
  for (let i = 0; i < 2 && !s.isFinished; i++) {
    const view = viewFor(s, "black");
    const m = blackProbe(view) ?? fastChooseMove(view, SIM);
    const r = tryMove(s, m);
    if (!r.ok) break;
    s = r.state;
    if (!r.revealedHidden) break;
  }
  return s;
}

/** 백 AI의 수와 숨길지 여부 */
export function chooseWhiteMove(state: GameState, level: AiLevel, rand: Rng = Math.random): { move: Position; hidden: boolean } {
  const plain = chooseMove(state, level, rand);
  if (!canUseHidden(state)) return { move: plain, hidden: false };
  // 엔진이 약한 단계: 가끔 무작위로 숨긴다(10수째까지 판마다 대략 한 번)
  if (!level.fast) return { move: plain, hidden: state.moveCount >= 1 && state.moveCount <= 21 && rand() < 0.1 };
  const n = state.config.boardSize;
  const b = FastBoard.fromState(state);
  const p0 = plain.row * n + plain.col;
  const top = new FastSearcher(b, level.fast.width).searchRoot(level.fast.depth, Math.max(30, level.fast.timeMs * 0.3), true, true).scores.slice(0, 5).map((x) => x.p);
  if (!top.includes(p0)) top.unshift(p0);
  const leafMs = Math.max(20, level.fast.timeMs * 0.06);
  let best = { move: plain, hidden: false }, bestV = -Infinity;
  for (const p of top) for (const hidden of [false, true]) {
    const r = tryMove(state, toPos(p, n), undefined, { hidden });
    if (!r.ok) continue;
    let v: number;
    if (r.state.isFinished) v = 1e9;
    else {
      const s2 = simulateBlack(r.state);
      if (s2.isFinished) v = s2.winner === "white" ? 1e9 : -1e9;
      else {
        const fb = FastBoard.fromState(s2);
        v = fb.winningMoves(2).length ? 1e8 : new FastSearcher(fb, level.fast.width).searchRoot(6, leafMs, false, true).scores[0].s;
      }
    }
    v += (rand() - 0.5) * 2 * (level.fast.noise || 0);
    if (v > bestV) { bestV = v; best = { move: toPos(p, n), hidden }; }
  }
  return best;
}
