// 백 히든 규칙용 AI 판단.
// - 백: 숨겨 둘지 말지. 후보 수마다 "보이게 둘 때 / 숨겨 둘 때"를 흑의 반응(숨은 돌을 빈칸으로 보는 AI)까지 흉내 내 비교한다.
//   (흑이 그 자리를 누르면 드러나고 흑이 다시 두는 것까지 흉내 낸다.) 약한 단계는 가끔 무작위로 숨긴다.
// - 흑: 숨은 돌이 있다는 것만 안다. "백 돌이 거기 있으면 백이 바로 이기는" 빈칸이 있으면 그 자리를 눌러 본다
//   — 숨은 돌이면 드러나고(차례 유지) 아니면 그 줄을 막는 수가 되어 손해가 없다.
import { canUseHidden, createGameFromConfig, tryMove, viewFor, type GameState, type Position } from "../game/index.ts";
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

export interface BeliefCell {
  pos: number;
  /** 숨은 돌이 여기 있을 확률(추정) */
  w: number;
  /** 여기 숨은 돌이 있으면 백이 바로 다음 수에 이긴다 */
  danger1: boolean;
  /** 여기 숨은 돌이 있으면 백이 한 수로 막을 수 없는 넉(열린 4·쌍4)을 만든다 */
  danger2: boolean;
}

const near = (a: number, b: number, n: number, d: number) => Math.abs(((a / n) | 0) - ((b / n) | 0)) <= d && Math.abs((a % n) - (b % n)) <= d;
const sameLine = (a: number, b: number, n: number) => {
  const dr = ((b / n) | 0) - ((a / n) | 0), dc = (b % n) - (a % n);
  return (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) && Math.max(Math.abs(dr), Math.abs(dc)) <= 4;
};

/**
 * 숨은 돌이 어디 있을지에 대한 흑의 짐작.
 * - 사전 확률: 백이 히든을 둔 그 순간의 판(흑이 다 아는 판)에서 백이 두기 좋은 자리일수록 높다(순위마다 ×0.7, 12위 밖은 아주 낮게).
 * - 지금의 증거: 그 뒤 백이 보이게 둔 돌들과 잘 어울리는 자리일수록 높다(백은 숨은 돌을 쓰려고 그 주변에 둔다).
 * - 위험: 거기 숨은 돌이 있으면 백이 바로 이기거나(danger1) 막을 수 없는 넉을 만드는(danger2) 자리는 크게 의심한다.
 */
export function hiddenBelief(view: GameState, maxCells = 10): BeliefCell[] {
  const h = view.hidden;
  if (!h || h.revealed || h.index < 0) return [];
  // 히든 직전 판 다시 만들기(그 앞의 수는 모두 보인다)
  let before = createGameFromConfig(view.config);
  for (let i = 0; i < h.index; i++) {
    const r = tryMove(before, view.moves[i]);
    if (!r.ok) return [];
    before = r.state;
  }
  const b0 = FastBoard.fromState(before);
  const n = b0.n;
  const rank = new Map(b0.candidates().map((p) => ({ p, s: b0.moveScore(p, 2) })).sort((x, y) => y.s - x.s).map((x, i) => [x.p, i] as const));
  const vb = FastBoard.fromState(view);
  const whites: number[] = [];
  for (let p = 0; p < n * n; p++) if (vb.cells[p] === 2) whites.push(p);
  const out: BeliefCell[] = [];
  for (let c = 0; c < n * n; c++) {
    if (vb.cells[c] || before.board[(c / n) | 0][c % n] !== null) continue; // 숨길 때 비어 있었고 지금도 비어 보이는 칸
    const r = rank.get(c);
    const prior = r === undefined ? 0.004 : r < 12 ? 0.7 ** r : 0.01;
    const use = Math.max(0, vb.moveScore(c, 2));
    vb.cells[c] = 2;
    const danger1 = vb.winningMoves(2).length > 0;
    let danger2 = false;
    if (!danger1 && whites.some((w) => near(w, c, n, 4))) {
      for (let m = 0; m < n * n && !danger2; m++) {
        if (vb.cells[m] || !sameLine(c, m, n)) continue;
        vb.cells[m] = 2;
        if (vb.winningMoves(2).length >= 2) danger2 = true;
        vb.cells[m] = 0;
      }
    }
    vb.cells[c] = 0;
    out.push({ pos: c, w: prior * (1 + use / 300) * (danger1 ? 30 : danger2 ? 8 : 1), danger1, danger2 });
  }
  out.sort((x, y) => y.w - x.w);
  const sum = out.reduce((a, x) => a + x.w, 0) || 1;
  return out.slice(0, maxCells).map((x) => ({ ...x, w: x.w / sum }));
}

/**
 * 추리하는 흑.
 * 1) 숨은 돌이 있으면 백이 바로 이기는 자리(위험 칸)가 그럴듯하면 먼저 눌러 본다 — 숨은 돌이면 드러나고 차례가 이어지며,
 *    아니어도 그 줄을 막는 수가 된다.
 * 2) 아니면 숨은 돌이 있을 법한 자리 몇 곳(가설)마다 후보 수를 읽어, 무게를 곱해 더한 기대값이 가장 좋은 수를 둔다.
 */
export function chooseBlackMoveBelief(view: GameState, level: AiLevel, rand: Rng = Math.random): Position {
  const plain = chooseMove(view, level, rand);
  const belief = hiddenBelief(view);
  if (!belief.length || !level.fast) return blackProbe(view) ?? plain;
  const n = view.config.boardSize;
  const won = tryMove(view, plain);
  if (won.ok && won.state.isFinished) return plain;
  const vb = FastBoard.fromState(view);
  const wins = vb.winningMoves(1);
  if (wins.length) return toPos(wins[0], n);
  if (vb.winningMoves(2).length) return plain; // 보이는 백의 위협부터 막는다
  // 1) 위험 칸
  const d1 = belief.filter((x) => x.danger1);
  if (d1.length && d1.reduce((a, x) => a + x.w, 0) >= 0.08) return toPos(d1[0].pos, n);
  // 2) 가설별 기대값
  const t = level.fast.timeMs;
  const cand = new FastSearcher(vb, level.fast.width).searchRoot(level.fast.depth, Math.max(30, t * 0.2), true, true).scores.slice(0, 6).map((x) => x.p);
  for (const x of belief.slice(0, 3)) if (!cand.includes(x.pos)) cand.push(x.pos);
  for (const x of belief) if (x.danger2 && !cand.includes(x.pos) && cand.length < 12) cand.push(x.pos);
  const hyp = belief.slice(0, 6);
  const wsum = hyp.reduce((a, x) => a + x.w, 0);
  const leafMs = Math.max(15, (t * 0.75) / (cand.length * hyp.length));
  let best = plain, bestV = -Infinity;
  for (const m of cand) {
    let ev = 0;
    for (const hp of hyp) {
      // 이 가설의 판: 보이는 판 + 숨은 돌
      const board = view.board.map((r) => r.slice());
      board[(hp.pos / n) | 0][hp.pos % n] = "white";
      const world: GameState = { ...view, board, hidden: null };
      let v: number;
      if (m === hp.pos) {
        // 찾았다: 드러나고 흑이 다시 둔다 → 흑 차례의 형세
        v = new FastSearcher(FastBoard.fromState(world), level.fast.width).searchRoot(6, leafMs, false, true).scores[0]?.s ?? 0;
      } else {
        const r = tryMove(world, toPos(m, n));
        if (!r.ok) { v = -1e7; }
        else if (r.state.isFinished) v = r.state.winner === "black" ? 1e9 : -1e9;
        else {
          const fb = FastBoard.fromState(r.state);
          v = fb.winningMoves(2).length ? -1e8 : -(new FastSearcher(fb, level.fast.width).searchRoot(6, leafMs, false, true).scores[0]?.s ?? 0);
        }
      }
      ev += (hp.w / wsum) * Math.max(-1e5, Math.min(1e5, v));
    }
    if (ev > bestV) { bestV = ev; best = toPos(m, n); }
  }
  return best;
}

/** 흑 AI의 수: 보이는 판으로만 생각한다(강한 단계는 숨은 돌 위치를 추리한다) */
export function chooseBlackMove(view: GameState, level: AiLevel, rand: Rng = Math.random): Position {
  if (level.fast && view.hidden && !view.hidden.revealed && view.hidden.index >= 0) return chooseBlackMoveBelief(view, level, rand);
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

export interface WhiteHiddenOptions {
  /**
   * (실험) 덜 뻔하게 숨기기: 흑은 "백이 두기 가장 좋은 자리"부터 의심하므로, 그런 자리일수록 들킬 확률을 높게 본다.
   * 숨긴 값 = (1 − 들킬 확률) × 숨긴 값 + 들킬 확률 × 보이게 둔 값 (흉내 낸 흑은 숨은 돌을 찾지 않으니 값은 형세 범위로 자른다)
   */
  avoidObvious?: boolean;
}

/** 백 AI의 수와 숨길지 여부 */
export function chooseWhiteMove(state: GameState, level: AiLevel, rand: Rng = Math.random, opts: WhiteHiddenOptions = {}): { move: Position; hidden: boolean } {
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
  const value = (p: number, hidden: boolean): number => {
    const r = tryMove(state, toPos(p, n), undefined, { hidden });
    if (!r.ok) return -Infinity;
    if (r.state.isFinished) return 1e9;
    const s2 = simulateBlack(r.state);
    if (s2.isFinished) return s2.winner === "white" ? 1e9 : -1e9;
    const fb = FastBoard.fromState(s2);
    return fb.winningMoves(2).length ? 1e8 : new FastSearcher(fb, level.fast!.width).searchRoot(6, leafMs, false, true).scores[0].s;
  };
  let findProb = (_p: number) => 0;
  if (opts.avoidObvious) {
    const rank = b.candidates().map((p) => ({ p, s: b.moveScore(p, 2) })).sort((x, y) => y.s - x.s).slice(0, 8);
    const w = new Map(rank.map((x, i) => [x.p, 0.7 ** i] as const));
    const wsum = [...w.values()].reduce((a, x) => a + x, 0) || 1;
    findProb = (p) => Math.min(0.9, 2 * ((w.get(p) ?? 0) / wsum));
  }
  const clamp = (v: number) => Math.max(-3000, Math.min(3000, v));
  let best = { move: plain, hidden: false }, bestV = -Infinity;
  for (const p of top) {
    const vis = value(p, false);
    const raw = value(p, true);
    const f = findProb(p);
    const hid = opts.avoidObvious ? (1 - f) * clamp(raw) + f * clamp(vis) : raw;
    for (const [hidden, v0] of [[false, vis], [true, hid]] as const) {
      const v = v0 + (rand() - 0.5) * 2 * (level.fast.noise || 0);
      if (v > bestV) { bestV = v; best = { move: toPos(p, n), hidden }; }
    }
  }
  return best;
}
