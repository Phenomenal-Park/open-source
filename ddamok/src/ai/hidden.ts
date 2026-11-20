// 백 히든 규칙용 AI 판단.
// - 백: 숨겨 둘지 말지. 후보 수마다 "보이게 둘 때 / 숨겨 둘 때"를 흑의 반응(숨은 돌을 빈칸으로 보는 AI)까지 흉내 내 비교한다.
//   (흑이 그 자리를 누르면 드러나고 흑이 다시 두는 것까지 흉내 낸다.) 약한 단계는 가끔 무작위로 숨긴다.
// - 흑: 숨은 돌이 있다는 것만 안다. "백 돌이 거기 있으면 백이 바로 이기는" 빈칸이 있으면 그 자리를 눌러 본다
//   — 숨은 돌이면 드러나고(차례 유지) 아니면 그 줄을 막는 수가 되어 손해가 없다.
import { canScan, canUseHidden, createGameFromConfig, tryMove, viewFor, type GameState, type Position } from "../game/index.ts";
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
    // 사전 확률은 완만하게: 백은 뻔한 자리를 피해 멀리 숨기기도 한다(무작위로 숨기는 백에게 뻔한 자리만 의심하면 당한다)
    const prior = r === undefined ? 0.03 : r < 20 ? Math.max(0.05, 0.85 ** r) : 0.05;
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
 * 추리하는 흑: 여러 판을 함께 읽는다.
 * - "숨은 돌이 상관없는 먼 곳에 있는 판(보이는 그대로)"과 "숨은 돌이 가장 의심스러운 몇 자리에 있는 판"을
 *   같은 후보 수로 깊게 읽고, 판마다의 점수에 그 판일 확률을 곱해 더한 값이 가장 좋은 수를 둔다.
 * - 가설 자리에 두는 수는 "찾아서 다시 두는" 값(그 판에서 흑이 한 수 더 두는 형세)으로 본다.
 * - 거기 숨은 돌이 있으면 백이 바로 이기는 자리(위험 칸)가 그럴듯하면 먼저 눌러 본다.
 */
export function chooseBlackMoveBelief(view: GameState, level: AiLevel, rand: Rng = Math.random, plainLevel: AiLevel = level): Position {
  const belief = hiddenBelief(view, 20);
  if (!belief.length || !level.fast) return blackProbe(view) ?? chooseMove(view, plainLevel, rand);
  const n = view.config.boardSize;
  const vb = FastBoard.fromState(view);
  const wins = vb.winningMoves(1);
  if (wins.length) return toPos(wins[0], n);
  if (vb.winningMoves(2).length) return chooseMove(view, plainLevel, rand); // 보이는 백의 위협부터 막는다
  const d1 = belief.filter((x) => x.danger1);
  if (d1.length && d1.reduce((a, x) => a + x.w, 0) >= 0.08) return toPos(d1[0].pos, n);
  const { timeMs: t, depth, width } = level.fast;
  const hyp = belief.slice(0, 4);
  // 거기 숨은 돌이 있으면 백이 막을 수 없는 넉을 만드는 자리는 순위가 낮아도 꼭 따로 읽는다(최소 6%로 친다).
  // 백은 천원에서 3~4칸 떨어진 곳에 숨기고 그쪽으로 줄을 이어 오는데, 흑 눈에는 별것 아닌 돌들로 보인다.
  for (const x of belief) if (x.danger2 && !hyp.includes(x) && hyp.length < 8) hyp.push({ ...x, w: Math.max(x.w, 0.06) });
  const roots = new FastSearcher(vb, width).searchRoot(depth, t * 0.15, false, true).scores.slice(0, 10).map((x) => x.p);
  for (const x of belief.slice(0, 3)) if (!roots.includes(x.pos)) roots.push(x.pos);
  for (const x of belief) if (x.danger2 && !roots.includes(x.pos) && roots.length < 14) roots.push(x.pos);
  const clamp = (v: number) => Math.max(-1e5, Math.min(1e5, v));
  const ev = new Map<number, number>(roots.map((p) => [p, 0]));
  const hypMass = hyp.reduce((a, x) => a + x.w, 0);
  const worlds = [
    { cell: -1, w: Math.max(0.2, 1 - hypMass), ms: t * 0.7 },
    ...hyp.map((x) => ({ cell: x.pos, w: x.w, ms: (t * 1.6) / hyp.length })),
  ];
  const wsum = worlds.reduce((a, x) => a + x.w, 0);
  for (const wd of worlds) {
    // 숨은 돌을 놓은 판은 GameState부터 다시 만든다(FastBoard는 줄 정보를 따로 들고 있어 칸만 바꾸면 안 된다)
    let ws = view;
    if (wd.cell >= 0) {
      const board = view.board.map((r) => r.slice());
      board[(wd.cell / n) | 0][wd.cell % n] = "white";
      ws = { ...view, board, hidden: null };
    }
    const sc = new FastSearcher(FastBoard.fromState(ws), width).searchRoot(depth, wd.ms, true, true, roots.filter((p) => p !== wd.cell)).scores;
    const got = new Map(sc.map((x) => [x.p, x.s] as const));
    const worst = sc.length ? Math.min(...sc.map((x) => x.s)) : 0;
    const again = sc[0]?.s ?? 0;
    for (const p of roots) {
      const v = p === wd.cell ? again : got.get(p) ?? worst; // 가설 자리를 누르면 찾고 다시 둔다
      ev.set(p, ev.get(p)! + (wd.w / wsum) * clamp(v));
    }
  }
  let best = roots[0], bestV = -Infinity;
  for (const [p, v] of ev) if (v > bestV) { bestV = v; best = p; }
  return toPos(best, n);
}

/** 흑 AI의 수: 보이는 판으로만 생각한다(강한 단계는 숨은 돌 위치를 추리한다) */
/**
 * 히든 판단에 쓸 고속 엔진 설정. 마스터·챌린저는 자기 설정, 골드~다이아(예전 엔진)도 히든만큼은 고속 엔진으로
 * 판단하게 한다(수 자체는 원래 엔진으로 둔다). 아이언~실버는 히든을 가끔 무작위로 쓴다.
 */
function withHidden(level: AiLevel): AiLevel {
  if (level.fast) return level;
  if (level.rating < 1000) return level;
  const fast: FastLevel = { depth: level.depth + 2, timeMs: 120, width: Math.max(9, level.width), noise: Math.max(10, level.noise), randomPick: 0, randomPool: 1, missWin: 0, focus: 1 };
  return { ...level, fast };
}

export function chooseBlackMove(view: GameState, level: AiLevel, rand: Rng = Math.random): Position {
  const L = withHidden(level);
  const unknown = !!view.hidden && !view.hidden.revealed && view.hidden.index >= 0;
  // 다이아(예전 엔진 최상위): 여러 판 읽기는 다이아 자신보다 센 고속 엔진으로 수를 골라 흑만 강해진다(같은 단계끼리 흑 78%).
  // 평소 수는 제 실력으로 두고, 숨은 돌이 위험할 때만 찔러 본다(같은 단계끼리 흑 47.5%, 40판).
  if (unknown && !level.fast && level.rating >= 1400) return chooseBlackMoveCautious(view, level, rand);
  if (unknown && L.fast) return chooseBlackMoveBelief(view, L, rand, level);
  const m = chooseMove(view, level, rand);
  const won = tryMove(view, m);
  if (won.ok && won.state.isFinished) return m;
  return blackProbe(view) ?? m;
}

/** 제 실력으로 두되, 거기 숨은 돌이 있으면 백이 바로 이기거나 막을 수 없는 넉을 만드는 자리가 의심스러우면 눌러 본다 */
function chooseBlackMoveCautious(view: GameState, level: AiLevel, rand: Rng): Position {
  const m = chooseMove(view, level, rand);
  const won = tryMove(view, m);
  if (won.ok && won.state.isFinished) return m;
  if (FastBoard.fromState(view).winningMoves(2).length) return m; // 보이는 위협부터 막는다
  const belief = hiddenBelief(view, 20);
  const n = view.config.boardSize;
  const d1 = belief.filter((x) => x.danger1);
  if (d1.length && d1.reduce((a, x) => a + x.w, 0) >= 0.08) return toPos(d1[0].pos, n);
  const d2 = belief.find((x) => x.danger2 && x.w >= 0.15);
  return d2 ? toPos(d2.pos, n) : m;
}

/**
 * 흑 스캔(한 판에 한 번, 차례를 쓰지 않음): 정말 의심되는 자리에만 쓴다.
 * - 거기 숨은 돌이 있으면 백이 바로 이기는 자리(위험 칸)가 조금이라도 그럴듯할 때
 * - 막을 수 없는 넉이 되는 자리가 꽤 그럴듯할 때
 * - 아니면 한 자리에 의심이 크게 몰렸을 때(백이 그쪽으로 줄을 이어 오는 등)
 * 근거 없이 아무 데나 찍지 않는다 — 처음엔 의심이 고르게 퍼져 있어 쓰지 않고, 백이 숨은 돌을 쓰려 할 때 쓴다.
 */
export function chooseBlackScan(view: GameState): Position | null {
  if (!canScan(view)) return null;
  const belief = hiddenBelief(view, 20);
  if (!belief.length) return null;
  const n = view.config.boardSize;
  const d1 = belief.filter((x) => x.danger1).sort((a, b) => b.w - a.w)[0];
  if (d1 && d1.w >= SCAN_D1) return toPos(d1.pos, n);
  const d2 = belief.filter((x) => x.danger2).sort((a, b) => b.w - a.w)[0];
  if (d2 && d2.w >= SCAN_D2) return toPos(d2.pos, n);
  return belief[0].w >= SCAN_TOP ? toPos(belief[0].pos, n) : null;
}
/** 스캔 기준: 위험 칸(바로 짐) / 막을 수 없는 넉 칸 / 그 밖의 칸의 의심(확률) */
const SCAN_D1 = 0.04;
const SCAN_D2 = 0.06;
const SCAN_TOP = 0.2;

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
  if (!canUseHidden(state)) return { move: stealthy(state, level, plain), hidden: false };
  // 엔진이 약한 단계(아이언~실버): 가끔 무작위로 숨긴다(10수째까지 판마다 대략 한 번)
  const L = withHidden(level);
  if (!L.fast) return { move: plain, hidden: state.moveCount >= 1 && state.moveCount <= 21 && rand() < 0.1 };
  level = L;
  const fast = L.fast;
  const n = state.config.boardSize;
  const b = FastBoard.fromState(state);
  const p0 = plain.row * n + plain.col;
  const top = new FastSearcher(b, fast.width).searchRoot(fast.depth, Math.max(30, fast.timeMs * 0.3), true, true).scores.slice(0, 5).map((x) => x.p);
  if (!top.includes(p0)) top.unshift(p0);
  const leafMs = Math.max(20, fast.timeMs * 0.06);
  const value = (p: number, hidden: boolean): number => {
    const r = tryMove(state, toPos(p, n), undefined, { hidden });
    if (!r.ok) return -Infinity;
    if (r.state.isFinished) return 1e9;
    const s2 = simulateBlack(r.state);
    if (s2.isFinished) return s2.winner === "white" ? 1e9 : -1e9;
    const fb = FastBoard.fromState(s2);
    return fb.winningMoves(2).length ? 1e8 : new FastSearcher(fb, fast.width).searchRoot(6, leafMs, false, true).scores[0].s;
  };
  let findProb = (_p: number) => 0;
  const avoid = opts.avoidObvious ?? true; // 흑이 의심할 만한 뻔한 자리는 피한다(기본)
  if (avoid) {
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
    const hid = avoid ? (1 - f) * clamp(raw) + f * clamp(vis) : raw;
    for (const [hidden, v0] of [[false, vis], [true, hid]] as const) {
      const v = v0 + (rand() - 0.5) * 2 * (hidden ? Math.max(HIDE_JITTER, fast.noise || 0) : fast.noise || 0);
      if (v > bestV) { bestV = v; best = { move: toPos(p, n), hidden }; }
    }
  }
  // 먼 자리에 숨기기: 천원 5×5 밖, 백 돌에서 4칸 안, 흑이 의심할 만한 자리(위 8곳)는 빼고 백에게 쓸모 있을 자리.
  // 당장 형세는 손해(한 수를 멀리 둔다)지만, 들키기 어렵고 나중에 그 줄로 공격을 이으면 흑이 못 본다 → 잠재 가치를 더한다.
  if (avoid && state.moveCount >= 3) {
    const h = (n / 2) | 0;
    const whites: number[] = [];
    for (let p = 0; p < n * n; p++) if (b.cells[p] === 2) whites.push(p);
    const pool = [...new Set([...b.candidates(), ...whites.flatMap((w) => ringAround(w, n))])];
    const far = pool
      .filter((p) => !b.cells[p] && findProb(p) === 0)
      .filter((p) => Math.max(Math.abs(((p / n) | 0) - h), Math.abs((p % n) - h)) >= 3)
      .filter((p) => whites.some((w) => Math.max(Math.abs(((w / n) | 0) - ((p / n) | 0)), Math.abs((w % n) - (p % n))) <= 4))
      .map((p) => ({ p, s: latent(b, p, n) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 4);
    for (const x of far) {
      if (x.s <= 0) continue;
      const v = clamp(value(x.p, true)) + x.s * FAR_LATENT + (rand() - 0.5) * 2 * Math.max(HIDE_JITTER, fast.noise || 0);
      if (v > bestV) { bestV = v; best = { move: toPos(x.p, n), hidden: true }; }
    }
  }
  return best;
}

/**
 * 티 안 내기: 숨은 돌이 아직 들키지 않았으면, 비슷하게 좋은 수 중 흑의 짐작에서 숨은 돌 자리가 덜 의심받는 수를 둔다.
 * (가장 좋은 수만 두면 숨은 돌로 줄을 이어 가는 수가 계속 나와 "여기 숨었다"고 알려 주는 꼴이 된다.)
 * 이기는 수, 막을 수 없는 공격처럼 결정적인 수는 그대로 둔다.
 */
function stealthy(state: GameState, level: AiLevel, plain: Position): Position {
  const h = state.hidden;
  const fast = withHidden(level).fast;
  // 골드 이하는 티 안 내기를 하지 않는다(골드끼리 흑 20% → 끄면 45%, 20판)
  if (level.rating < 1200 || !fast || !h || h.revealed || h.index < 0 || state.currentPlayer !== "white" || state.isFinished) return plain;
  const n = state.config.boardSize;
  const hp = h.pos.row * n + h.pos.col;
  const b = FastBoard.fromState(state);
  if (b.winningMoves(2).length || b.winningMoves(1).length) return plain; // 이기거나 막아야 할 때
  const sc = new FastSearcher(b, fast.width).searchRoot(Math.min(fast.depth, 8), Math.max(30, fast.timeMs * 0.5), true, true).scores;
  if (!sc.length) return plain;
  const top = sc[0].s;
  if (top >= STEALTH_DECISIVE) return plain;
  const p0 = plain.row * n + plain.col;
  const pool = sc.filter((x) => x.s >= top - STEALTH_MARGIN).slice(0, 6);
  if (!pool.some((x) => x.p === p0)) pool.unshift({ p: p0, s: sc.find((x) => x.p === p0)?.s ?? top });
  let best = p0, bestV = -Infinity;
  for (const x of pool) {
    const r = tryMove(state, toPos(x.p, n));
    if (!r.ok) continue;
    const bel = hiddenBelief(viewFor(r.state, "black"), 20);
    const c = bel.find((y) => y.pos === hp);
    const sus = c ? c.w * (bel.indexOf(c) < 4 ? 2 : 1) : 0; // 흑이 깊게 읽는 상위 4자리에 들면 더 크게 본다
    const v = x.s - STEALTH_WEIGHT * sus;
    if (v > bestV) { bestV = v; best = x.p; }
  }
  return toPos(best, n);
}
/** 티 안 내기: 가장 좋은 수보다 이만큼 덜 좋은 수까지 고려한다 */
const STEALTH_MARGIN = 150;
/** 티 안 내기: 숨은 돌 자리 의심(확률) 1당 깎는 점수 */
const STEALTH_WEIGHT = 1500;
/** 이 점수 이상인 수(사실상 이기는 공격)는 티를 내더라도 둔다 */
const STEALTH_DECISIVE = 5000;

/** 숨길 자리 고르기의 흔들림: 비슷하게 좋은 자리 중에서 판마다 다르게 숨긴다(늘 같은 자리면 사람이 금방 외운다) */
const HIDE_JITTER = 250;

/** 먼 히든 자리의 잠재 가치 1점당 형세 점수 */
const FAR_LATENT = 40;

/** p에서 가로·세로·대각으로 4칸 안의 칸들 */
function ringAround(p: number, n: number): number[] {
  const r = (p / n) | 0, c = p % n, out: number[] = [];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) for (let k = -4; k <= 4; k++) {
    if (!k) continue;
    const rr = r + dr * k, cc = c + dc * k;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
  }
  return out;
}

/** 잠재 가치: p를 지나는 5칸 창 중 흑 돌이 없고 백 돌이 1~2개 있는 창(나중에 숨은 돌과 이어질 줄)의 백 돌 합 */
function latent(b: FastBoard, p: number, n: number): number {
  const r = (p / n) | 0, c = p % n;
  let v = 0;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) for (let st = -4; st <= 0; st++) {
    let w = 0, ok = true;
    for (let i = 0; i < 5; i++) {
      const rr = r + dr * (st + i), cc = c + dc * (st + i);
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) { ok = false; break; }
      const x = b.cells[rr * n + cc];
      if (x === 1) { ok = false; break; }
      if (x === 2) w++;
    }
    if (ok && w >= 1 && w <= 2) v += w;
  }
  return v;
}
