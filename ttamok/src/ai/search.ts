// 따목 AI — 수읽기(알파베타)와 기력 조절.
import type { GameState, Position } from "../game/types.ts";
import { tryMove } from "../game/rules.ts";
import { candidateMoves, evaluate, isUrgent, quickScore, WIN_SCORE } from "./evaluate.ts";
import type { AiLevel } from "./levels.ts";

export type Rng = () => number;

class Budget extends Error {}

interface Scored {
  move: Position;
  score: number;
}

/** 빠른 점수 상위 width개 + 급한 자리(넉 점·5목·포획 승리를 만들거나 막는 자리)는 항상 포함. */
function ordered(state: GameState, width: number, urgent = true): Scored[] {
  const me = state.currentPlayer;
  const all = candidateMoves(state.board)
    .map((move) => ({ move, score: quickScore(state, move, me) }))
    .sort((a, b) => b.score - a.score);
  const top = all.slice(0, width);
  if (!urgent) return top;
  for (const s of all.slice(width)) if (isUrgent(state, s.move, me)) top.push(s);
  return top;
}

export interface SearchStats {
  nodes: number;
  depth: number;
  scored?: { move: Position; score: number }[];
}

/** 둘 차례 입장의 점수를 돌려주는 네가맥스 알파베타. */
function negamax(state: GameState, depth: number, alpha: number, beta: number, width: number, ctx: { nodes: number; limit: number }, ply: number): number {
  if (++ctx.nodes > ctx.limit) throw new Budget();
  if (depth === 0) return evaluate(state);
  let best = -Infinity;
  for (const { move } of ordered(state, width, depth >= 2)) {
    const r = tryMove(state, move);
    if (!r.ok) continue;
    // 이 수로 이기면(5목 또는 포획 승리) 더 볼 필요 없음. 빨리 이기는 수를 선호.
    const v = r.state.isFinished ? WIN_SCORE - ply : -negamax(r.state, depth - 1, -beta, -alpha, width, ctx, ply + 1);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? 0 : best;
}

function gaussian(rand: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** 기력에 맞춰 다음 수를 고른다. 원본 state는 바꾸지 않는다. */
export function chooseMove(state: GameState, level: AiLevel, rand: Rng = Math.random, stats?: SearchStats): Position {
  if (state.isFinished) throw new Error("game is finished");
  // 이번 수에 집중하는가: 아니면 한 수 덜 읽고, 급한 자리도 빠뜨릴 수 있다(약한 단계의 "놓침")
  const focused = rand() < level.focus;
  const depth = focused ? level.depth : Math.max(1, level.depth - 1);
  const roots = ordered(state, Math.max(level.width, 12), focused && depth >= 2);

  // 1. 바로 이기는 수(5목·포획 승리)는 거의 놓치지 않는다 — 약한 단계는 가끔 놓친다.
  if (rand() >= level.missWin) {
    for (const { move } of roots) {
      const r = tryMove(state, move);
      if (r.ok && r.state.isFinished) return move;
    }
  }

  // 2. 아주 약한 단계: 그럴듯한 후보 중 아무거나
  if (rand() < level.randomPick) {
    const pool = roots.slice(0, level.randomPool);
    return pool[Math.floor(rand() * pool.length)].move;
  }

  // 3. 수읽기: 깊이를 1씩 늘리다 계산량 한도를 넘으면 직전 깊이 결과를 쓴다.
  // 탐색할 뿌리 후보: 상위 width개 + (집중한 수라면) 급한 자리
  const rootSearch = [...roots.slice(0, level.width), ...roots.slice(Math.max(level.width, 12))];
  let scored: Scored[] = rootSearch.map((r) => ({ move: r.move, score: r.score / 10 }));
  let reached = 0;
  const ctx = { nodes: 0, limit: level.nodeBudget };
  for (let d = 1; d <= depth; d++) {
    try {
      const next: Scored[] = [];
      for (const { move } of rootSearch) {
        const r = tryMove(state, move);
        if (!r.ok) continue;
        const v = r.state.isFinished ? WIN_SCORE : -negamax(r.state, d - 1, -Infinity, Infinity, level.width, ctx, 1);
        next.push({ move, score: v });
      }
      scored = next;
      reached = d;
    } catch (e) {
      if (!(e instanceof Budget)) throw e;
      break;
    }
  }
  if (stats) { stats.nodes = ctx.nodes; stats.depth = reached; stats.scored = scored; }

  // 4. 실수: 점수에 잡음을 더해 고른다(사람이 할 법한 차선의 수).
  let best = scored[0];
  let bestV = -Infinity;
  for (const s of scored) {
    const v = s.score + (level.noise ? gaussian(rand) * level.noise : 0);
    if (v > bestV) { bestV = v; best = s; }
  }
  return best.move;
}
