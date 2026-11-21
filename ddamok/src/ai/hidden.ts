// 백 히든 규칙용 AI 판단.
// - 백: 숨겨 둘지 말지. 후보 수마다 "보이게 둘 때 / 숨겨 둘 때"를 흑의 반응(숨은 돌을 빈칸으로 보는 AI)까지 흉내 내 비교한다.
//   (흑이 그 자리를 누르면 드러나고 흑이 다시 두는 것까지 흉내 낸다.) 약한 단계는 가끔 무작위로 숨긴다.
// - 흑: 숨은 돌이 있다는 것만 안다. "백 돌이 거기 있으면 백이 바로 이기는" 빈칸이 있으면 그 자리를 눌러 본다
//   — 숨은 돌이면 드러나고(차례 유지) 아니면 그 줄을 막는 수가 되어 손해가 없다.
import { canScan, canUseHidden, createGameFromConfig, scanAt, tryMove, viewFor, type GameState, type Position } from "../game/index.ts";
import { FastBoard } from "./fast.ts";
import { fastChooseMove, FastSearcher, WIN, type FastLevel } from "./fastSearch.ts";
import type { AiLevel } from "./levels.ts";
import { chooseMove } from "./search.ts";
import { experienceBonus, hideHistory, positionKey } from "./experience.ts";

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
    b.place(c, 2);
    const k = b.winningMoves(2).length;
    b.unplace(c);
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
  /** 여기 숨은 돌이 있으면 그 돌을 받침으로 백이 흑 두 점을 새로 따낼 수 있다 */
  dangerCap?: boolean;
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
export function hiddenBelief(view: GameState, maxCells = 10, modelLevel?: AiLevel): BeliefCell[] {
  const h = view.hidden;
  if (!h || h.revealed || h.index < 0) return [];
  // 히든 직전 판 다시 만들기(그 앞의 수는 모두 보인다)
  let before = createGameFromConfig(view.config);
  for (let i = 0; i < h.index; i++) {
    if (view.scan && view.scan.at === i) { // (매직스톤) 히든 전에 쓴 매직스톤도 다시 놓는다(턴이 넘어갔을 수 있다)
      const sr = scanAt(before, view.scan.pos);
      if (sr.ok) before = sr.state;
    }
    const r = tryMove(before, view.moves[i]);
    if (!r.ok) return [];
    before = r.state;
  }
  if (view.swapped) before = swapColors(before); // (양쪽 히든) 백이 흑의 숨은 돌을 읽을 때: 색을 바꾼 판
  const b0 = FastBoard.fromState(before);
  // "내가 백이라면 어디 숨겼을까"(같은 엔진으로 흉내) — 있으면 사전 확률에 크게 더한다
  const model = modelLevel ? whiteHideModel(before, modelLevel) : null;
  // 이 상대가 같은 판에서 지난번에 실제로 숨긴 자리(기록이 쌓일수록 더 믿는다)
  const hist = modelLevel ? hideHistory(before) : undefined;
  const histTotal = hist ? [...hist.values()].reduce((a, x) => a + x, 0) : 0;
  const histScale = histTotal ? (HIST_SCALE * histTotal) / (histTotal + 2) / histTotal : 0;
  const n = b0.n;
  const rank = new Map(b0.candidates().map((p) => ({ p, s: b0.moveScore(p, 2) })).sort((x, y) => y.s - x.s).map((x, i) => [x.p, i] as const));
  const vb = FastBoard.fromState(view);
  const whites: number[] = [];
  for (let p = 0; p < n * n; p++) if (vb.cells[p] === 2) whites.push(p);
  // 지금 백이 따낼 수 있는 자리(숨은 돌이 새로 만드는 따내기만 위험으로 친다)
  const capNow = new Set<number>();
  for (let p = 0; p < n * n; p++) if (!vb.cells[p] && vb.capturesAt(p, 2).length) capNow.add(p);
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];
  const out: BeliefCell[] = [];
  for (let c = 0; c < n * n; c++) {
    if (vb.cells[c] || before.board[(c / n) | 0][c % n] !== null) continue; // 숨길 때 비어 있었고 지금도 비어 보이는 칸
    if (view.scan && !view.scan.hit && view.scan.pos.row * n + view.scan.pos.col === c) continue; // 스캔으로 비어 있다고 확인된 칸
    const r = rank.get(c);
    // 사전 확률은 완만하게: 백은 뻔한 자리를 피해 멀리 숨기기도 한다(무작위로 숨기는 백에게 뻔한 자리만 의심하면 당한다)
    const prior = (r === undefined ? 0.03 : r < 20 ? Math.max(0.05, 0.85 ** r) : 0.05) + (model?.get(c) ?? 0) * MODEL_SCALE + (hist?.get(c) ?? 0) * histScale;
    const use = Math.max(0, vb.moveScore(c, 2));
    vb.place(c, 2);
    const danger1 = vb.winningMoves(2).length > 0;
    let danger2 = false;
    if (!danger1 && whites.some((w) => near(w, c, n, 4))) {
      for (let m = 0; m < n * n && !danger2; m++) {
        if (vb.cells[m] || !sameLine(c, m, n)) continue;
        vb.place(m, 2);
        if (vb.winningMoves(2).length >= 2) danger2 = true;
        vb.unplace(m);
      }
    }
    // 숨은 돌이 따내기 받침이 되는 자리: 거기 있으면 백이 다음 수에 흑 두 점을 새로 따낼 수 있다
    let dangerCap = false;
    const cr = (c / n) | 0, cc = c % n;
    for (const [dr, dc] of DIRS) {
      const r3 = cr + 3 * dr, c3 = cc + 3 * dc;
      if (r3 < 0 || c3 < 0 || r3 >= n || c3 >= n) continue;
      const p3 = r3 * n + c3;
      if (vb.cells[p3] || capNow.has(p3)) continue;
      if (vb.capturesAt(p3, 2).length) { dangerCap = true; break; }
    }
    vb.unplace(c);
    out.push({ pos: c, w: prior * (1 + use / 300) * (danger1 ? 30 : danger2 ? 8 : dangerCap ? 4 : 1), danger1, danger2, dangerCap });
  }
  out.sort((x, y) => y.w - x.w);
  const sum = out.reduce((a, x) => a + x.w, 0) || 1;
  // 위험 칸(바로 이김·막을 수 없는 넉)은 순위가 낮아도 늘 함께 돌려준다
  const keep = [...out.slice(0, maxCells), ...out.slice(maxCells).filter((x) => x.danger1 || x.danger2 || x.dangerCap)];
  return keep.map((x) => ({ ...x, w: x.w / sum }));
}

/**
 * 추리하는 흑: 여러 판을 함께 읽는다.
 * - "숨은 돌이 상관없는 먼 곳에 있는 판(보이는 그대로)"과 "숨은 돌이 가장 의심스러운 몇 자리에 있는 판"을
 *   같은 후보 수로 깊게 읽고, 판마다의 점수에 그 판일 확률을 곱해 더한 값이 가장 좋은 수를 둔다.
 * - 가설 자리에 두는 수는 "찾아서 다시 두는" 값(그 판에서 흑이 한 수 더 두는 형세)으로 본다.
 * - 거기 숨은 돌이 있으면 백이 바로 이기는 자리(위험 칸)가 그럴듯하면 먼저 눌러 본다.
 */
export function chooseBlackMoveBelief(view: GameState, level: AiLevel, rand: Rng = Math.random, plainLevel: AiLevel = level): Position {
  const belief = hiddenBelief(view, 20, plainLevel.fast ? plainLevel : undefined);
  if (!belief.length || !level.fast) return blackProbe(view) ?? chooseMove(view, plainLevel, rand);
  const n = view.config.boardSize;
  const vb = FastBoard.fromState(view);
  const wins = vb.winningMoves(1);
  if (wins.length) return toPos(wins[0], n);
  if (vb.winningMoves(2).length) return chooseMove(view, plainLevel, rand); // 보이는 백의 위협부터 막는다
  const d1 = belief.filter((x) => x.danger1);
  if (d1.length && d1.reduce((a, x) => a + x.w, 0) >= 0.08) {
    const block = blockHiddenWins(view, d1);
    if (block >= 0) return toPos(block, n);
  }
  const { timeMs: t, depth, width } = level.fast;
  const hyp = belief.slice(0, 4);
  // 거기 숨은 돌이 있으면 백이 막을 수 없는 넉을 만드는 자리는 순위가 낮아도 꼭 따로 읽는다(최소 6%로 친다).
  // 백은 천원에서 3~4칸 떨어진 곳에 숨기고 그쪽으로 줄을 이어 오는데, 흑 눈에는 별것 아닌 돌들로 보인다.
  // 거기 숨은 돌이 있으면 백이 바로 이기는 자리는 짐작상 낮아도 반드시 읽는다(엉뚱한 곳에 숨기고 줄을 이어 오는 백 대비)
  for (const x of belief) if (x.danger1 && !hyp.includes(x) && hyp.length < 8) hyp.push({ ...x, w: Math.max(x.w, 0.1) });
  for (const x of belief) if (x.danger2 && !hyp.includes(x) && hyp.length < 8) hyp.push({ ...x, w: Math.max(x.w, 0.06) });
  for (const x of belief) if (x.dangerCap && !hyp.includes(x) && hyp.length < 8) hyp.push({ ...x, w: Math.max(x.w, 0.04) });
  const roots = new FastSearcher(vb, width).searchRoot(depth, t * 0.15, false, true).scores.slice(0, 10).map((x) => x.p);
  for (const x of belief.slice(0, 3)) if (!roots.includes(x.pos)) roots.push(x.pos);
  for (const x of belief) if ((x.danger1 || x.danger2 || x.dangerCap) && !roots.includes(x.pos) && roots.length < 14) roots.push(x.pos);
  const clamp = (v: number) => Math.max(-1e5, Math.min(1e5, v));
  const ev = new Map<number, number>(roots.map((p) => [p, 0]));
  const hypMass = hyp.reduce((a, x) => a + x.w, 0);
  const worlds = [
    { cell: -1, w: Math.max(0.2, 1 - hypMass), ms: t * 0.7 },
    ...hyp.map((x) => ({ cell: x.pos, w: x.w, ms: (t * 1.6) / hyp.length })),
  ];
  const wsum = worlds.reduce((a, x) => a + x.w, 0);
  const perWorld = new Map<number, Map<number, number>>(); // 판(숨은 돌 자리, -1 = 보이는 판) → 수 → 값
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
    perWorld.set(wd.cell, got);
    for (const p of roots) {
      const v = p === wd.cell ? again : got.get(p) ?? worst; // 가설 자리를 누르면 찾고 다시 둔다
      ev.set(p, ev.get(p)! + (wd.w / wsum) * clamp(v));
    }
  }
  // 착수로 지우기: 의심 자리에 두는 수가 그 자체로도 흑에게 좋은 수(보이는 판에서 가장 좋은 수와 PROBE_MARGIN 안쪽)면,
  // 빗나가도 "거기엔 없다"를 알게 되는 값(그 자리일 확률 × 거기 있으면 흑의 가장 좋은 수가 잃는 값)을 더한다.
  const vis = perWorld.get(-1);
  if (vis && vis.size) {
    let bestP = -1, bestS = -Infinity;
    for (const [p, v] of vis) if (v > bestS) { bestS = v; bestP = p; }
    for (const x of hyp) {
      const own = vis.get(x.pos);
      const inWorld = perWorld.get(x.pos)?.get(bestP);
      if (own === undefined || inWorld === undefined || !ev.has(x.pos)) continue;
      if (clamp(own) < clamp(bestS) - PROBE_MARGIN) continue; // 흑에게 득이 없는 자리는 착수로 확인하지 않는다(스캔이 맡는다)
      const loss = Math.max(0, clamp(bestS) - clamp(inWorld));
      ev.set(x.pos, ev.get(x.pos)! + (x.w / wsum) * loss);
    }
  }
  // 경험: 이 자리에서 진 적이 있는 수는 깎는다
  const key = positionKey(view);
  for (const [p, v] of ev) ev.set(p, v + experienceBonus(key, p));
  // 비슷하게 좋은 수(가장 좋은 값과 VARY_EV 안쪽) 중 무작위 — 같은 판을 되풀이하지 않게
  let bestV = -Infinity;
  for (const v of ev.values()) if (v > bestV) bestV = v;
  // 대부분의 가설 판에서 진다고 읽히면 포기하지 말고, 보이는 판에서 가장 잘 버티는 수를 둔다
  if (bestV <= -5e4) return chooseMove(view, plainLevel, rand);
  const vary = view.moveCount < 12 ? VARY_EV_OPENING : VARY_EV; // 초반엔 더 넓게 — 같은 응수를 되풀이해 읽히지 않게
  const near = [...ev].filter(([, v]) => v >= bestV - vary).map(([p]) => p);
  return toPos(near[Math.floor(rand() * near.length)], n);
}
/**
 * 숨은 돌이 있으면 백이 바로 오목을 만드는 자리(위험 칸)가 여럿일 때: 가장 의심되는 한 곳만 찔러 보지 않고,
 * 그럴듯한 위험 판들을 가장 많이(확률 합) 막는 수를 둔다. 막는다 = 그 자리를 눌러 숨은 돌을 찾거나,
 * 그 판에서 흑이 두고 나면 백에게 바로 이기는 수가 남지 않는 것. 막을 수 없으면 -1.
 */
function blockHiddenWins(view: GameState, d1: BeliefCell[]): number {
  return blockHiddenWinsCover(view, d1).pos;
}

/** blockHiddenWins + 그 수가 막는 확률 합과 위험 판 전체 확률 합 */
function blockHiddenWinsCover(view: GameState, d1: BeliefCell[]): { pos: number; cover: number; total: number } {
  const n = view.config.boardSize;
  const worlds = d1.map((x) => {
    const board = view.board.map((r) => r.slice());
    board[(x.pos / n) | 0][x.pos % n] = "white";
    const st: GameState = { ...view, board, hidden: null };
    return { x, st, wins: FastBoard.fromState(st).winningMoves(2) };
  });
  const cands = new Set<number>();
  for (const w of worlds) { cands.add(w.x.pos); for (const p of w.wins) cands.add(p); }
  let best = -1, bestCover = 0;
  for (const m of cands) {
    if (view.board[(m / n) | 0][m % n] !== null) continue;
    let cover = 0;
    for (const w of worlds) {
      if (m === w.x.pos) { cover += w.x.w; continue; } // 누르면 찾는다(드러나고 다시 둔다)
      if (w.st.board[(m / n) | 0][m % n] !== null) continue;
      const r = tryMove(w.st, toPos(m, n));
      if (!r.ok) continue;
      if (r.state.isFinished ? r.state.winner === "black" : FastBoard.fromState(r.state).winningMoves(2).length === 0) cover += w.x.w;
    }
    if (cover > bestCover) { bestCover = cover; best = m; }
  }
  return { pos: best, cover: bestCover, total: worlds.reduce((a, w) => a + w.x.w, 0) };
}

/** 여러 판 읽기에서 "비슷하게 좋다"로 보는 폭 */
const VARY_EV = 25;
/** 초반(12수 전)의 폭 */
const VARY_EV_OPENING = 80;
/** 착수로 지우기: 흑 자신에게도 이만큼 안쪽으로 좋은 수일 때만(형세 점수) */
const PROBE_MARGIN = 150;

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
 * - 아니면 한 자리에 의심이 확실히 몰렸을 때(처음엔 35%, 수가 진행될수록 20%까지)
 * 근거 없이 찍지 않는다 — 백이 숨긴 바로 다음(흑 2수째 등)에는 쓰지 않고, 백이 그 뒤에 둔 수로 흔적이 생긴 다음에 쓴다.
 */
export function chooseBlackScan(view: GameState, level?: AiLevel): Position | null {
  return scanDecision(view, level)?.pos ?? null;
}

/** 스캔 판단과 그 이유(위험 칸 / 넉 칸 / 확신)·그 자리 의심(확률) — 측정·분석용으로도 쓴다 */
export function scanDecision(view: GameState, level?: AiLevel): { pos: Position; reason: "danger1" | "danger2" | "risk" | "top"; w: number } | null {
  if (!canScan(view)) return null;
  // 근거 없이 찍지 않는다: 백이 숨긴 뒤 보이는 수를 한 번 이상 두어 흔적이 생긴 다음에만
  if (view.moves.length < view.hidden!.index + 3) return null;
  const belief = hiddenBelief(view, 20, level && withHidden(level).fast && (level.fast || level.rating >= 1400) ? level : undefined);
  if (!belief.length) return null;
  const n = view.config.boardSize;
  const d1 = belief.filter((x) => x.danger1).sort((a, b) => b.w - a.w)[0];
  if (d1 && d1.w >= SCAN_D1) {
    // 한 수로 모든 위험 판을 막을 수 있으면(예: 3목 끝의 두 빈칸 — 안쪽에 두면 둘 다 막는다) 스캔을 아끼고 그 수를 둔다
    const all = belief.filter((x) => x.danger1);
    const b = blockHiddenWinsCover(view, all);
    if (b.pos >= 0 && b.cover >= b.total * 0.999) return null;
    return { pos: toPos(d1.pos, n), reason: "danger1", w: d1.w };
  }
  // 배제용 스캔: 맞히려는 게 아니라, 거기 숨은 돌이 있으면 흑의 수가 가장 크게 망가지는 의심 자리를 지워 둔다.
  // 위험 = (그 자리일 확률) × (흑이 지금 두려는 수가 그 판에서 잃는 값). 가장 큰 곳이 기준을 넘으면 스캔.
  const fastLevel = level && withHidden(level).fast;
  if (fastLevel && SCAN_RISK > 0) {
    const vb = FastBoard.fromState(view);
    const plan = new FastSearcher(vb, fastLevel.width).searchRoot(fastLevel.depth, Math.max(30, fastLevel.timeMs * 0.3), false, true).scores.slice(0, 3);
    if (plan.length) {
      const ms = Math.max(15, fastLevel.timeMs * 0.12);
      let bestRisk = 0, bestCell = -1;
      for (const x of belief.slice(0, 6)) {
        if (x.w < SCAN_RISK_MIN_W) continue; // 거기 있을 법하지 않은 자리에 한 번뿐인 스캔을 쓰지 않는다
        const board = view.board.map((r) => r.slice());
        board[(x.pos / n) | 0][x.pos % n] = "white";
        const fb = FastBoard.fromState({ ...view, board, hidden: null });
        const sc = new FastSearcher(fb, fastLevel.width).searchRoot(Math.min(fastLevel.depth, 8), ms, true, true, plan.map((y) => y.p).filter((p) => p !== x.pos)).scores;
        if (!sc.length) continue;
        const clamp = (v: number) => Math.max(-1e5, Math.min(1e5, v));
        const loss = Math.max(0, clamp(plan[0].s) - clamp(sc[0].s)); // 계획한 수들 중 가장 나은 것도 이 판에선 이만큼 나빠진다
        const risk = x.w * loss;
        if (risk > bestRisk) { bestRisk = risk; bestCell = x.pos; }
      }
      if (bestCell >= 0 && bestRisk >= SCAN_RISK) return { pos: toPos(bestCell, n), reason: "risk", w: belief.find((b) => b.pos === bestCell)!.w };
    }
  }
  const d2 = belief.filter((x) => x.danger2).sort((a, b) => b.w - a.w)[0];
  if (d2 && d2.w >= SCAN_D2) return { pos: toPos(d2.pos, n), reason: "danger2", w: d2.w };
  // "그냥 가장 의심되는 자리"는 찍지 않는다: 위험이 없는 자리는 맞혀도 얻는 게 적다(35% 이상 확신 스캔 16번 중 5번 적중, 흑 6승).
  // 스캔은 거기 숨은 돌이 있으면 흑이 크게 잃는 자리를 지우는 데만 쓴다(그런 스캔 9번 중 8번 적중, 흑 6승).
  return null;
}
/**
 * (실험) 흑 ⓧ(착수 금지, 한 판에 한 번, 차례를 쓰지 않음) 판단.
 * 1) 숨은 돌 의심: 스캔과 같은 기준으로 찍는다 — 있으면 드러나고, 없으면 그 급소가 막힌다.
 * 2) 보이는 판에서 진다고 읽히면(백의 넉·쌍삼 등) 백의 급소 하나를 막아 살아나는 자리를 찾는다. 살아날 수 없으면 아낀다.
 */
export function blockDecision(view: GameState, level: AiLevel): { pos: Position; reason: "hidden" | "save" | "green" } | null {
  if (!view.config.blackBlock || view.currentPlayer !== "black" || !canScan(view)) return null;
  const fl = withHidden(level).fast;
  if (!fl) return null;
  const n = view.config.boardSize;
  const vb = FastBoard.fromState(view);
  if (vb.winningMoves(1).length) return null;
  if (view.config.scanCostsMove) return magicAsMove(view, vb, fl);
  const h = view.hidden;
  if (h && h.index >= 0 && !h.revealed && view.moves.length >= h.index + 3) {
    // 숨은 돌 의심: 거기 숨은 돌이 있으면 백이 바로 이기는 판들(위험 판)을 "실드 + 이번 착수"로 가장 많이 막는 실드 자리.
    // 착수 하나로 충분히 막히면 아낀다(한 번뿐인 방어). 실드를 숨은 돌 후보에 치면 거기 있을 때 찾고, 백이 이길 자리에 치면 그 줄을 막는다.
    const belief = hiddenBelief(view, 20, level.fast || level.rating >= 1400 ? withHidden(level) : undefined);
    const d1 = belief.filter((x) => x.danger1);
    const mass = d1.reduce((a, x) => a + x.w, 0);
    if (mass >= SHIELD_D1) {
      const plain = blockHiddenWinsCover(view, d1).cover;
      const cands = new Set<number>(d1.map((x) => x.pos));
      for (const x of d1) {
        const board = view.board.map((r) => r.slice());
        board[(x.pos / n) | 0][x.pos % n] = "white";
        for (const p of FastBoard.fromState({ ...view, board, hidden: null }).winningMoves(2)) cands.add(p);
      }
      let bestCell = -1, bestCover = plain;
      for (const c of [...cands].slice(0, 16)) {
        const found = d1.find((x) => x.pos === c)?.w ?? 0;
        const v2: GameState = { ...view, scan: { pos: toPos(c, n), at: view.moves.length, hit: false } };
        const rest = d1.filter((x) => x.pos !== c);
        const cover = found + (rest.length ? blockHiddenWinsCover(v2, rest).cover : 0);
        if (cover > bestCover) { bestCover = cover; bestCell = c; }
      }
      if (bestCell >= 0 && bestCover - plain >= SHIELD_GAIN) return { pos: toPos(bestCell, n), reason: "hidden" };
    }
  }
  const greenCells = view.config.greenStone ? vb.greenCaptureCells(6) : [];
  vb.setWallAvail(false); // ⓧ 없이 버틸 수 있는지 본다
  const base = new FastSearcher(vb, fl.width).searchRoot(fl.depth, Math.max(40, fl.timeMs * 0.3), false, true).scores;
  if (!base.length) return null;
  const lost = base[0].s <= -(WIN / 2);
  if (!lost && !greenCells.length) return null;
  const cands = new Set<number>(greenCells);
  if (lost) {
    for (const p of vb.winningMoves(2)) cands.add(p);
    const scored: [number, number][] = [];
    for (const p of vb.candidates()) scored.push([p, vb.moveScore(p, 2)]);
    scored.sort((a, b) => b[1] - a[1]);
    for (const [p] of scored.slice(0, 8)) cands.add(p);
  }
  let best = -1, bestS = base[0].s;
  for (const p of cands) {
    const st: GameState = { ...view, scan: { pos: toPos(p, n), at: view.moves.length, hit: false } };
    const sc = new FastSearcher(FastBoard.fromState(st), fl.width).searchRoot(fl.depth, Math.max(30, fl.timeMs * 0.25), false, true).scores;
    if (sc.length && sc[0].s > bestS) { bestS = sc[0].s; best = p; }
  }
  if (best < 0) return null;
  if (lost) return bestS > -(WIN / 2) ? { pos: toPos(best, n), reason: "save" } : null;
  // 초록돌로 따내기: 한 번뿐이니 형세가 크게 좋아질 때만(또는 이기게 될 때)
  return bestS >= WIN / 2 || bestS - base[0].s >= GREEN_GAIN ? { pos: toPos(best, n), reason: "green" } : null;
}

/**
 * (매직스톤, 턴을 쓰는 규칙) 매직스톤도 한 수다: 흑돌 대신 중립 돌을 두는 셈이라 막기만 할 때는 대개 흑돌이 낫다.
 * 쓸모 있는 때 — 백 두 점의 한쪽 끝을 받쳐 다음에 따낼 자리를 만들 때, 흑돌을 두면 따이는 급소를 막을 때 등.
 * 후보마다 "매직스톤을 두고 백 차례"를 읽어, 흑의 가장 좋은 착수보다 MAGIC_MARGIN 이상 나을 때만 쓴다.
 * 숨은 돌 찾기에는 쓰지 않는다: 그 자리에 흑돌을 두면 찾고도 차례가 남는다.
 */
function magicAsMove(view: GameState, vb: FastBoard, fl: FastLevel): { pos: Position; reason: "save" | "green" } | null {
  const n = view.config.boardSize;
  const base = new FastSearcher(vb, fl.width).searchRoot(fl.depth, Math.max(40, fl.timeMs * 0.35), false, true).scores;
  if (!base.length) return null;
  const lost = base[0].s <= -(WIN / 2);
  const cands = new Set<number>(vb.greenCaptureCells(6));
  for (const p of vb.winningMoves(2)) cands.add(p);
  const scored: [number, number][] = vb.candidates().map((p) => [p, vb.moveScore(p, 2)]);
  scored.sort((a, b) => b[1] - a[1]);
  for (const [p] of scored.slice(0, 6)) cands.add(p);
  let best = -1, bestS = -Infinity;
  for (const p of cands) {
    const st: GameState = { ...view, scan: { pos: toPos(p, n), at: view.moves.length, hit: false }, currentPlayer: "white" };
    const sc = new FastSearcher(FastBoard.fromState(st), fl.width).searchRoot(fl.depth, Math.max(30, fl.timeMs * 0.2), false, true).scores;
    if (!sc.length) continue;
    const v = -sc[0].s;
    if (v > bestS) { bestS = v; best = p; }
  }
  if (best < 0) return null;
  if (lost) return bestS > -(WIN / 2) ? { pos: toPos(best, n), reason: "save" } : null;
  return bestS - base[0].s >= MAGIC_MARGIN ? { pos: toPos(best, n), reason: "green" } : null;
}
/** 매직스톤(턴을 씀)을 흑돌 대신 둘 기준(형세 점수) */
const MAGIC_MARGIN = 150;

/** 실드를 숨은 돌 위험에 쓰는 기준: 위험 판 확률 합, 그리고 실드로 더 막게 되는 확률 */
const SHIELD_D1 = 0.08;
const SHIELD_GAIN = 0.1;
/** 초록돌을 따내기에 쓰는 기준(형세 점수) */
const GREEN_GAIN = 500;

/** 백 숨김 흉내의 무게: 일반 사전 확률 전체(대략 13)보다 크게 */
const MODEL_SCALE = 25;
/** 이 상대가 실제로 숨긴 기록의 무게(기록이 많을수록 이 값에 가까워진다): 흉내보다 크게 */
const HIST_SCALE = 40;
/** 스캔 기준: 위험 칸(바로 짐) / 막을 수 없는 넉 칸 / 그 밖의 칸의 의심(확률) */
const SCAN_D1 = 0.005; // 바로 지는 걸 막는 스캔은 아끼지 않는다
const SCAN_D2 = 0.1;
/** 배제용 스캔 기준(확률 × 잃는 값, 형세 점수 단위) */
const SCAN_RISK = 300;
/** 지우기용 스캔도 이 의심(확률) 이상인 자리에만 — 20% 미만 자리에 쓴 6번은 하나도 맞지 않았다 */
const SCAN_RISK_MIN_W = 0.2;

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
  if (!canUseHidden(state)) return { move: stealthy(state, level, plain, rand), hidden: false };
  // 엔진이 약한 단계(아이언~실버): 가끔 무작위로 숨긴다(10수째까지 판마다 대략 한 번)
  const L = withHidden(level);
  if (!L.fast) return { move: plain, hidden: state.moveCount >= 1 && state.moveCount <= 21 && rand() < 0.1 };
  const n = state.config.boardSize;
  const { options, jitter } = whiteHideOptions(state, level, plain, opts);
  // 쓰는 때를 판마다 다르게: 초반(21수까지)에는 이번 차례에 숨길 마음이 있을 때만(HIDE_WILL) 숨기는 후보를 본다.
  // 첫 수 절반, 나머지는 3·5·7수째 쪽으로 퍼진다. 숨겨야 바로 이기는 등 결정적인 경우는 늘 본다.
  const willing = state.moveCount > 21 || rand() < HIDE_WILL || options.some((o) => o.hidden && o.v >= 1e8);
  let best = { move: plain, hidden: false }, bestV = -Infinity;
  for (const o of options) {
    if (o.hidden && !willing) continue;
    const v = o.v + (rand() - 0.5) * 2 * (o.hidden ? jitter.hidden : jitter.visible);
    if (v > bestV) { bestV = v; best = { move: toPos(o.p, n), hidden: o.hidden }; }
  }
  return best;
}

interface HideOption { p: number; hidden: boolean; v: number }

/**
 * 백이 이번 수에 고를 수 있는 후보(보이게 두기·숨기기)와 흔들림 전의 값. 백 AI가 쓰고,
 * 흑 AI도 "내가 백이라면 어디에 숨겼을까"를 짐작하는 데 쓴다(whiteHideModel).
 */
function whiteHideOptions(state: GameState, level: AiLevel, plain: Position, opts: WhiteHiddenOptions = {}): { options: HideOption[]; jitter: { hidden: number; visible: number } } {
  const L = withHidden(level);
  const fast = L.fast!;
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
    return fb.winningMoves(2).length ? 1e8 : new FastSearcher(fb, fast.width).searchRoot(6, leafMs, false, true).scores[0]?.s ?? 0;
  };
  let findProb = (_p: number) => 0;
  const avoid = opts.avoidObvious ?? true; // 흑이 의심할 만한 뻔한 자리는 피한다(기본)
  if (avoid) {
    const rank = b.candidates().map((p) => ({ p, s: b.moveScore(p, 2) })).sort((x, y) => y.s - x.s).slice(0, 8);
    const w = new Map(rank.map((x, i) => [x.p, 0.7 ** i] as const));
    const wsum = [...w.values()].reduce((a, x) => a + x, 0) || 1;
    findProb = (p) => Math.min(0.9, 2 * ((w.get(p) ?? 0) / wsum));
    // (매직스톤 실험) 흑이 곧 둘 법한 자리(흑 입장 좋은 수 위 8곳)에 숨기면 흑의 착수에 부딪혀 드러난다
    // (1세트: 흑이 착수로 찾은 32판에서 백 6승). 그런 자리도 들킬 확률로 친다.
    if (state.config.blackBlock) {
      const rb = b.candidates().map((p) => ({ p, s: b.moveScore(p, 1) })).sort((x, y) => y.s - x.s).slice(0, 8);
      const wb = new Map(rb.map((x, i) => [x.p, 0.7 ** i] as const));
      const wbsum = [...wb.values()].reduce((a, x) => a + x, 0) || 1;
      const base = findProb;
      findProb = (p) => Math.min(0.9, base(p) + BUMP_WEIGHT * 2 * ((wb.get(p) ?? 0) / wbsum));
    }
  }
  const clamp = (v: number) => Math.max(-3000, Math.min(3000, v));
  const options: HideOption[] = [];
  for (const p of top) {
    const vis = value(p, false);
    const raw = value(p, true);
    const f = findProb(p);
    options.push({ p, hidden: false, v: vis }, { p, hidden: true, v: avoid ? (1 - f) * clamp(raw) + f * clamp(vis) : raw });
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
    for (const x of far) if (x.s > 0) options.push({ p: x.p, hidden: true, v: clamp(value(x.p, true)) + x.s * FAR_LATENT });
  }
  // 첫 수(백 돌이 아직 없음)에도 엉뚱한 곳에 숨길 수 있게: 천원에서 3~4칸 떨어진 자리 몇 곳을 후보로(판마다 다르게 뽑는다)
  if (avoid && b.cells.every((x) => x !== 2)) {
    const h = (n / 2) | 0;
    const ring: number[] = [];
    for (let p = 0; p < n * n; p++) {
      const d = Math.max(Math.abs(((p / n) | 0) - h), Math.abs((p % n) - h));
      if (!b.cells[p] && d >= 3 && d <= 4) ring.push(p);
    }
    for (let k = 0; k < 4 && ring.length; k++) {
      const p = ring.splice(Math.floor(Math.random() * ring.length), 1)[0];
      options.push({ p, hidden: true, v: clamp(value(p, true)) + FIRST_FAR_BONUS });
    }
  }
  return { options, jitter: { hidden: Math.max(HIDE_JITTER, fast.noise || 0), visible: fast.noise || 0 } };
}

/**
 * 흑의 "내가 백이라면": 백이 숨긴 순간의 판에서 백 AI가 숨길 만한 자리의 확률(백이 숨겼다는 것을 안다는 조건).
 * 백의 흔들림까지 흉내 내 여러 번 뽑아 센다. 판마다 한 번만 계산해 둔다.
 */
const hideModelCache = new Map<string, Map<number, number>>();
export function whiteHideModel(before: GameState, level: AiLevel): Map<number, number> {
  const key = `${level.id}|${before.moves.map((m) => `${m.row},${m.col}`).join(" ")}`;
  const hit = hideModelCache.get(key);
  if (hit) return hit;
  const out = new Map<number, number>();
  if (withHidden(level).fast && canUseHidden(before)) {
    const plain = chooseMove(before, level, () => 0.5);
    const { options, jitter } = whiteHideOptions(before, level, plain);
    let x = 12345;
    const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
    let hides = 0;
    for (let k = 0; k < 400; k++) {
      let best: HideOption | null = null, bestV = -Infinity;
      for (const o of options) {
        const v = o.v + (rnd() - 0.5) * 2 * (o.hidden ? jitter.hidden : jitter.visible);
        if (v > bestV) { bestV = v; best = o; }
      }
      if (best?.hidden) { hides++; out.set(best.p, (out.get(best.p) ?? 0) + 1); }
    }
    for (const [p, c] of out) out.set(p, c / Math.max(1, hides));
  }
  if (hideModelCache.size > 32) hideModelCache.clear();
  hideModelCache.set(key, out);
  return out;
}

/**
 * 티 안 내기: 숨은 돌이 아직 들키지 않았으면, 비슷하게 좋은 수 중 흑의 짐작에서 숨은 돌 자리가 덜 의심받는 수를 둔다.
 * (가장 좋은 수만 두면 숨은 돌로 줄을 이어 가는 수가 계속 나와 "여기 숨었다"고 알려 주는 꼴이 된다.)
 * 이기는 수, 막을 수 없는 공격처럼 결정적인 수는 그대로 둔다.
 */
function stealthy(state: GameState, level: AiLevel, plain: Position, rand: Rng = Math.random): Position {
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
  // 숨긴 직후 몇 수(백 수 3번까지)는 블러핑: 숨긴 곳과 딴판인 수도 더 넓게 허용한다(숨은 돌은 나중에 이어질 때 힘을 쓴다)
  const sinceHide = state.moves.length - h.index;
  const margin = sinceHide <= 6 ? STEALTH_MARGIN_EARLY : STEALTH_MARGIN;
  const pool = sc.filter((x) => x.s >= top - margin).slice(0, 8);
  if (!pool.some((x) => x.p === p0)) pool.unshift({ p: p0, s: sc.find((x) => x.p === p0)?.s ?? top });
  // 이 수로 숨은 돌이 스스로 드러나는가(숨은 돌을 받침으로 따내기 등) — 드러내는 수는 숨은 돌의 값만큼 깎는다
  const reveals = (p: number) => { const r = tryMove(state, toPos(p, n)); return r.ok && !r.state.isFinished && !!r.state.hidden?.revealed; };
  if (pool.every((x) => reveals(x.p))) {
    // 비슷한 수가 모두 드러내는 수면, 조금 덜 좋아도 드러내지 않는 수를 후보에 넣는다
    for (const x of sc) if (x.s >= top - margin - REVEAL_COST && !pool.some((y) => y.p === x.p) && !reveals(x.p) && pool.length < 12) pool.push(x);
  }
  let best = p0, bestV = -Infinity;
  for (const x of pool) {
    const r = tryMove(state, toPos(x.p, n));
    if (!r.ok) continue;
    const selfReveal = !r.state.isFinished && !!r.state.hidden?.revealed;
    const bel = hiddenBelief(viewFor(r.state, "black"), 20);
    const c = bel.find((y) => y.pos === hp);
    const sus = c ? c.w * (bel.indexOf(c) < 4 ? 2 : 1) : 0; // 흑이 깊게 읽는 상위 4자리에 들면 더 크게 본다
    const v = x.s - STEALTH_WEIGHT * sus - (selfReveal ? REVEAL_COST : 0) + rand() * VARY_EV; // 비슷하면 판마다 다르게
    if (v > bestV) { bestV = v; best = x.p; }
  }
  return toPos(best, n);
}
/** 티 안 내기: 가장 좋은 수보다 이만큼 덜 좋은 수까지 고려한다 */
const STEALTH_MARGIN = 150;
/** 숨긴 직후(블러핑)에는 이만큼까지 */
const STEALTH_MARGIN_EARLY = 350;
/** 티 안 내기: 숨은 돌 자리 의심(확률) 1당 깎는 점수 */
const STEALTH_WEIGHT = 1500;
/** 숨은 돌을 스스로 드러내는 수의 대가: 드러내도 그만큼 이득일 때만 둔다 */
const REVEAL_COST = 500;
/** 이 점수 이상인 수(사실상 이기는 공격)는 티를 내더라도 둔다 */
const STEALTH_DECISIVE = 5000;

/** 숨길 자리 고르기의 흔들림: 비슷하게 좋은 자리 중에서 판마다 다르게 숨긴다(늘 같은 자리면 사람이 금방 외운다) */
const HIDE_JITTER = 500;
/** 초반에 이번 차례 숨길 마음이 있을 확률 */
const HIDE_WILL = 0.5;

/** 첫 수에 먼 곳에 숨길 때 더하는 값(들키지 않는 값 — 백 돌이 없어 잠재 가치를 셀 수 없다) */
const FIRST_FAR_BONUS = 120;
/** (매직스톤 실험) 흑의 착수에 부딪혀 드러날 확률의 무게 */
const BUMP_WEIGHT = 1;
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
      if (x === 1 || x === 3) { ok = false; break; }
      if (x === 2) w++;
    }
    if (ok && w >= 1 && w <= 2) v += w;
  }
  return v;
}

/**
 * (양쪽 히든) 흑과 백을 맞바꾼 판: 흑의 숨은 돌을 읽는 백이 "흑 입장의 추리"를 그대로 쓰도록.
 * 돌 색·차례·따낸 수·따냄 목표·숨은 돌/스캔을 서로 바꾼다. 수의 좌표는 그대로다.
 */
export function swapColors(s: GameState): GameState {
  const sw = (c: GameState["board"][number][number]) => (c === "black" ? "white" : c === "white" ? "black" : c);
  const other = (p: "black" | "white"): "black" | "white" => (p === "black" ? "white" : "black");
  return {
    ...s,
    config: { ...s.config, captureTarget: { black: s.config.captureTarget.white, white: s.config.captureTarget.black } },
    board: s.board.map((r) => r.map(sw)),
    currentPlayer: other(s.currentPlayer),
    capturedByBlack: s.capturedByWhite,
    capturedByWhite: s.capturedByBlack,
    hidden: s.hiddenB ?? null,
    hiddenB: s.hidden,
    scan: s.scanW ?? null,
    scanW: s.scan,
    winner: s.winner ? other(s.winner) : null,
    swapped: !s.swapped,
  };
}

/** 숨긴다면 어디에: 백 AI의 숨김 후보(먼 곳 포함) 중 흔들림을 넣어 하나를 고른다. 숨길 수 없으면 null */
export function chooseHideSpot(state: GameState, level: AiLevel, rand: Rng = Math.random): Position | null {
  if (!canUseHidden(state) || !withHidden(level).fast) return null;
  const plain = chooseMove(state, level, rand);
  const { options, jitter } = whiteHideOptions(state, level, plain);
  let best: HideOption | null = null, bestV = -Infinity;
  for (const o of options) {
    if (!o.hidden) continue;
    const v = o.v + (rand() - 0.5) * 2 * jitter.hidden;
    if (v > bestV) { bestV = v; best = o; }
  }
  return best ? toPos(best.p, state.config.boardSize) : null;
}
