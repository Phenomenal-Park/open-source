// 고속 판(fast.ts) 위의 수읽기: 반복 심화 알파베타 + 같은 판 기억(전치표) + 강제수 연장.
//   - 둘 차례인 쪽이 바로 이길 수 있으면 즉시 승리로 본다.
//   - 상대가 다음 수에 이길 자리가 있으면(넉 점·포획 승리 위협) 그 자리 막기·따내서 깨기만 둔다(깊이를 줄이지 않음).
import type { GameState, Position } from "../game/types.ts";
import { isLegalMove } from "../game/rules.ts";
import { experienceBonus, positionKey } from "./experience.ts";
import { secondMoveRestricted } from "../game/config.ts";
import { FastBoard, type Color } from "./fast.ts";

export const WIN = 1_000_000;

export interface FastLevel {
  /** 최대 읽기 깊이 */
  depth: number;
  /** 한 수 계산 시간 한도(ms) */
  timeMs: number;
  /** 한 수마다 볼 후보 수 */
  width: number;
  /** 최종 점수 잡음 */
  noise: number;
  /** 초반(8수 전)에만 주는 잡음 — 강한 단계가 같은 수순을 되풀이하지 않게(깊이는 그대로) */
  openingNoise?: number;
  /**
   * 판 내내 같은 수순을 되풀이하지 않게: 가장 좋은 수와 이만큼 안쪽으로 비슷한 후보(상위 3개) 중에서 무작위로 고른다.
   * 후보끼리는 짧게 다시 읽어 견준다(본래 깊이 읽기는 그대로, 결정적인 수가 있으면 쓰지 않는다).
   */
  vary?: number;
  /** 후보 중 아무거나 둘 확률 */
  randomPick: number;
  randomPool: number;
  /** 바로 이기는 수를 놓칠 확률 */
  missWin: number;
  /** 강제수(막기) 연장을 할 확률 — 낮으면 상대 위협을 놓친다 */
  focus: number;
  /** 연속 위협 탐색 깊이(0 = 안 씀): 내 필승 수순을 찾고, 상대의 필승 수순을 허용하는 수를 피한다 */
  vcfDepth?: number;
  /** 실험용: 공격(내 필승 찾기)만 / 방어만 */
  vcfMode?: "both" | "attack" | "defend";
  /** 형세 가중치(없으면 기본값) — 자동 조정 실험용 */
  weights?: readonly number[];
}

class Timeout extends Error {}

interface Entry {
  depth: number;
  score: number;
  flag: 0 | 1 | 2; // 0 정확, 1 하한, 2 상한
  move: number;
}

export interface FastStats {
  nodes: number;
  depth: number;
  ms: number;
}

export class FastSearcher {
  private b: FastBoard;
  private tt = new Map<number, Entry>();
  private nodes = 0;
  private deadline = 0;
  private focusOn = true;
  private readonly width: number;
  private killer: Int32Array = new Int32Array(64).fill(-1);

  constructor(b: FastBoard, width: number) {
    this.b = b;
    this.width = width;
  }

  /** 둘 차례인 쪽(c)이 바로 이길 수 있는 자리(5목·포획 승리)가 있을 수 있는가 — 비싼 검사 전에 거르기 */
  private mayWin(c: Color): boolean {
    return this.b.fours[c] > 0 || this.b.target[c] - this.b.caps[c] <= 4;
  }

  private ordered(c: Color, ttMove: number, ply: number): number[] {
    const b = this.b;
    const cands = b.candidates();
    const scored = cands.map((p) => ({ p, s: b.moveScore(p, c) + (p === ttMove ? 1e9 : p === this.killer[ply] ? 1e8 : 0) }));
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, this.width).map((x) => x.p);
  }

  /** 상대의 즉시 승리 위협이 있으면 막을 수 있는 수만(막기 + 따내기). 위협이 없으면 null */
  private forcedReplies(me: Color): number[] | null {
    const op: Color = me === 1 ? 2 : 1;
    if (!this.focusOn || !this.mayWin(op)) return null;
    const threats = this.b.winningMoves(op);
    if (!threats.length) return null;
    const set = new Set(threats);
    for (const p of this.b.candidates()) if (this.b.capturesAt(p, me).length) set.add(p);
    return [...set];
  }

  private node(depth: number, alpha: number, beta: number, ply: number): number {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) throw new Timeout();
    const b = this.b, me = b.toMove;
    if (this.mayWin(me) && b.winningMoves(me).length) return WIN - ply;
    const forced = this.forcedReplies(me);
    if (depth <= 0 && !forced) return b.evaluate();
    if (ply > 40) return b.evaluate();

    const key = b.hash;
    const hit = this.tt.get(key);
    if (hit && hit.depth >= depth) {
      if (hit.flag === 0) return hit.score;
      if (hit.flag === 1 && hit.score >= beta) return hit.score;
      if (hit.flag === 2 && hit.score <= alpha) return hit.score;
    }
    const moves = forced ?? this.ordered(me, hit?.move ?? -1, ply);
    if (!moves.length) return -(WIN - ply);
    const a0 = alpha;
    let best = -Infinity, bestMove = moves[0];
    // (실험) 흑 ⓧ: 백이 막을 곳이 둘 이상인 결정타를 만들었으면, 흑은 그중 하나를 ⓧ로 막고(차례 그대로) 이어서 둘 수 있다
    if (forced && me === 1 && b.wallAvail && !b.wallCosts) {
      const threats = b.winningMoves(2);
      if (threats.length >= 2) {
        // 흑은 숨은 돌로 생긴 위협은 보지 못하므로 거기엔 실드를 칠 수 없다(백이 보는 판에서만 해당)
        for (const t of threats) {
          if (!b.visibleThreat(t)) continue;
          b.addWall(t); b.setWallAvail(false);
          let v: number;
          try { v = this.node(depth, alpha, beta, ply); } finally { b.setWallAvail(true); b.removeWall(t); }
          if (v > best) best = v;
          if (v > alpha) alpha = v;
          if (alpha >= beta) break;
        }
        if (alpha >= beta) {
          this.tt.set(key, { depth, score: best, flag: 1, move: bestMove });
          return best;
        }
      }
    }
    // (실험) 초록돌: 흑은 백 두 점의 한쪽 끝에 초록돌을 놓고 이어서 따낼 수도 있다 — 백은 이걸 알고 두 점을 내놓지 않는다
    if (!forced && me === 1 && b.wallAvail && b.wallAnchor && depth >= 2) {
      for (const g of b.greenCaptureCells(3)) {
        b.addWall(g); b.setWallAvail(false);
        let v: number;
        try {
          if (b.wallCosts) { b.passTurn(); try { v = -this.node(depth - 1, -beta, -alpha, ply + 1); } finally { b.passTurn(); } }
          else v = this.node(depth - 1, alpha, beta, ply);
        } finally { b.setWallAvail(true); b.removeWall(g); }
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      if (alpha >= beta) {
        this.tt.set(key, { depth, score: best, flag: 1, move: bestMove });
        return best;
      }
    }
    for (const m of moves) {
      const res = b.play(m);
      // 시간이 다 되어 읽기가 끊겨도(Timeout) 둬 본 돌은 반드시 치운다 — 예전엔 끊긴 자리의 돌이 판에 남아,
      // 같은 판을 이어 쓰는 단계(흔들기·버티기·숨길 자리 후보 등)가 엉뚱한 판을 보고 판단했다
      let v: number;
      try { v = res === 1 ? WIN - ply : res === 2 ? 0 : -this.node(forced ? depth : depth - 1, -beta, -alpha, ply + 1); } finally { b.undo(); }
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) { this.killer[ply] = m; break; }
    }
    this.tt.set(key, { depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0, move: bestMove });
    return best;
  }

  /**
   * 연속 위협(VCF): 넉 점(또는 포획 승리 위협)을 연달아 두어 반드시 이기는 첫 수. 없으면 -1.
   * 수비 응수는 위협 자리 막기·따내서 깨기·먼저 이기기만 있으므로 그 모두에 대해 이겨야 한다.
   */
  vcf(maxDepth: number, budget = 20_000): number {
    this.vcfNodes = 0;
    this.vcfBudget = budget;
    return this.vcfAt(maxDepth);
  }

  private vcfNodes = 0;
  private vcfBudget = 0;

  private vcfAt(depth: number): number {
    const b = this.b, me = b.toMove, op: Color = me === 1 ? 2 : 1;
    if (depth <= 0 || ++this.vcfNodes > this.vcfBudget) return -1;
    if (this.mayWin(op) && b.winningMoves(op).length) return -1; // 상대가 먼저 이긴다
    for (const p of b.candidates()) {
      const capThreat = b.target[me] - b.caps[me] <= 4;
      if (!b.makesFour(p, me) && !capThreat) continue;
      const res = b.play(p);
      if (res === 1) { b.undo(); return p; }
      if (res === 2) { b.undo(); continue; }
      // 이제 상대 차례: 내가 다음에 이길 자리가 있어야 강제수
      const threats = b.winningMoves(me);
      if (!threats.length) { b.undo(); continue; }
      // (실험) 흑에게 ⓧ가 남아 있으면 백의 쌍넉도 막힌다고 보고, 확실한 승리로 치지 않는다
      if (op === 1 && b.wallAvail && !b.wallCosts && threats.length >= 2) { b.undo(); continue; }
      const replies = new Set(threats);
      for (const q of b.candidates()) if (b.capturesAt(q, op).length) replies.add(q);
      let allWin = true;
      for (const r of replies) {
        const res2 = b.play(r);
        let ok: boolean;
        if (res2 !== 0) ok = false; // 상대가 이기거나 무승부
        else ok = b.winningMoves(me).length > 0 || this.vcfAt(depth - 1) >= 0;
        b.undo();
        if (!ok) { allWin = false; break; }
        if (this.vcfNodes > this.vcfBudget) { allWin = false; break; }
      }
      b.undo();
      if (allWin) return p;
    }
    return -1;
  }

  /**
   * 뿌리 후보 각각의 점수. fullWindow면 잡음을 섞을 수 있게 모든 후보의 정확한 점수를 구한다.
   * 시간이 다 되면 마지막으로 끝까지 읽은 깊이의 결과를 쓴다.
   */
  searchRoot(maxDepth: number, timeMs: number, fullWindow: boolean, focus: boolean, rootMoves?: number[]): { scores: { p: number; s: number }[]; stats: FastStats } {
    const t0 = performance.now();
    this.deadline = t0 + timeMs;
    this.focusOn = focus;
    const b = this.b, me = b.toMove;
    let roots = rootMoves ?? this.forcedReplies(me) ?? this.ordered(me, -1, 0);
    if (!roots.length) return { scores: [], stats: { nodes: this.nodes, depth: 0, ms: 0 } }; // 볼 수가 없다(예: 후보가 가설 자리 하나뿐)
    let result = roots.map((p) => ({ p, s: b.moveScore(p, me) / 1000 }));
    let reached = 0;
    for (let d = 1; d <= maxDepth; d++) {
      try {
        const scores: { p: number; s: number }[] = [];
        let alpha = -Infinity;
        for (const p of roots) {
          const res = b.play(p);
          let v: number;
          try {
            v = res === 1 ? WIN : res === 2 ? 0 : -this.node(d - 1, -Infinity, fullWindow ? Infinity : -alpha, 1);
          } finally {
            b.undo();
          }
          scores.push({ p, s: v });
          if (v > alpha) alpha = v;
          if (v >= WIN - 100) break; // 이기는 수 발견
        }
        scores.sort((x, y) => y.s - x.s);
        result = scores;
        reached = d;
        roots = [...scores.map((x) => x.p), ...roots.filter((p) => !scores.some((x) => x.p === p))];
        if (scores[0].s >= WIN - 100 || scores[0].s <= -(WIN - 100)) break;
      } catch (e) {
        if (!(e instanceof Timeout)) throw e;
        break;
      }
    }
    return { scores: result, stats: { nodes: this.nodes, depth: reached, ms: performance.now() - t0 } };
  }
}

function gaussian(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** 고속 엔진으로 다음 수를 고른다(기력 조절 포함). 원본 state는 바꾸지 않는다. */
export function fastChooseMove(state: GameState, level: FastLevel, rand: () => number = Math.random, stats?: FastStats): Position {
  if (state.isFinished) throw new Error("game is finished");
  const b = FastBoard.fromState(state);
  if (level.weights) b.weights = level.weights;
  const n = b.n;
  const toPos = (p: number): Position => ({ row: (p / n) | 0, col: p % n });
  const me = b.toMove;

  // 바로 이기는 수
  if (rand() >= level.missWin) {
    const wins = b.winningMoves(me);
    if (wins.length) return toPos(wins[0]);
  }
  // 아주 약한 단계: 그럴듯한 후보 중 아무거나
  if (rand() < level.randomPick) {
    const pool = b.candidates().map((p) => ({ p, s: b.moveScore(p, me) })).sort((x, y) => y.s - x.s).slice(0, level.randomPool);
    return toPos(pool[(rand() * pool.length) | 0].p);
  }
  // 규칙상 특정 자리만 둘 수 있는 수(예: 펜테식 제한의 흑 3수째)는 둘 수 있는 자리 중에서만 고른다
  const restricted = secondMoveRestricted(state.config) && state.moveCount === 2;
  // 둘 수 있는 자리 중 천원 가까운 곳만(거리 제한이면 그 바로 바깥 줄까지, 아니면 천원에서 3칸 이내)
  const radius = state.config.secondMoveMinDistance > 0 ? state.config.secondMoveMinDistance + 1 : 3;
  const rootMoves = restricted
    ? Array.from({ length: n * n }, (_, p) => p).filter((p) => !b.cells[p] && isLegalMove(state, toPos(p)))
        .filter((p) => { const r = (p / n) | 0, c = p % n, h = (n / 2) | 0; return Math.max(Math.abs(r - h), Math.abs(c - h)) <= radius; })
    : undefined;
  if (restricted && rand() < level.randomPick) return toPos(rootMoves![(rand() * rootMoves!.length) | 0]);
  const searcher = new FastSearcher(b, level.width);
  const focus = rand() < level.focus;
  const vcfDepth = focus ? level.vcfDepth ?? 0 : 0;
  const vcfMode = level.vcfMode ?? "both";
  if (vcfDepth > 0 && vcfMode !== "defend") {
    const win = searcher.vcf(vcfDepth);
    if (win >= 0) return toPos(win);
  }
  // 흔들림(noise)이 있으면 후보마다 정확한 점수가 필요해 전체 창으로 읽는다(느려진다).
  // 강한 단계는 초반 몇 수에만 흔들림을 줘서(openingNoise) 판마다 다르게 두되 본래 깊이는 지킨다.
  const noise = level.noise || (state.moveCount < 8 ? level.openingNoise ?? 0 : 0);
  const { scores, stats: st } = searcher.searchRoot(focus ? level.depth : Math.max(1, level.depth - 2), level.timeMs, noise > 0, focus, rootMoves);
  if (stats) Object.assign(stats, st);
  // 상대의 연속 위협(필승 수순)을 허용하는 수는 피한다(점수 높은 후보부터 최대 5개)
  if (vcfDepth > 0 && vcfMode !== "attack") {
    for (const x of scores.slice(0, 5)) {
      const res = b.play(x.p);
      const loses = res === 0 && new FastSearcher(b, level.width).vcf(vcfDepth, 8_000) >= 0;
      b.undo();
      if (loses) x.s -= WIN / 2;
      else break;
    }
    scores.sort((p, q) => q.s - p.s);
  }
  // 경험: 이 자리에서 진 적이 있는 수는 점수를 깎는다(이긴 수는 조금 더한다)
  const key = positionKey(state);
  for (const x of scores) x.s += experienceBonus(key, x.p);
  scores.sort((p, q) => q.s - p.s);
  let best = scores[0], bestV = -Infinity;
  for (const x of scores) {
    const v = x.s + (noise ? gaussian(rand) * noise : 0);
    if (v > bestV) { bestV = v; best = x; }
  }
  // 질 것으로 읽혀도 포기하지 않는다: 깊게 보면 모든 수가 지는 판이면, 짧게(4수) 다시 읽어 지금 보이는 위협을
  // 가장 잘 막는 자연스러운 수를 둔다(상대가 실수할 여지를 남긴다). 바로 이기는 수가 있으면 위에서 이미 둔다.
  if (best.s <= -(WIN / 2) && scores.length > 1) {
    const resist = new FastSearcher(b, level.width).searchRoot(Math.min(4, level.depth), Math.max(20, level.timeMs * 0.2), true, true, scores.slice(0, 12).map((x) => x.p)).scores;
    const keep = resist.find((x) => x.s > -(WIN / 2)) ?? resist[0];
    if (keep) return toPos(keep.p);
  }
  if (!noise && level.vary && scores.length > 1 && Math.abs(best.s) < WIN / 2) {
    const alt = varyAmong(b, scores.slice(0, 3).map((x) => x.p), best.p, level, rand, key);
    if (alt >= 0) return toPos(alt);
  }
  return toPos(best.p);
}

/**
 * 비슷하게 좋은 후보 중 무작위: 후보마다 상대 차례로 짧게 읽어(같은 깊이·같은 창) 견주고,
 * 가장 좋은 수보다 level.vary 이상 나쁘지 않은 것 중 하나를 고른다. 모두 나쁘면 -1.
 */
function varyAmong(b: FastBoard, cands: number[], bestP: number, level: FastLevel, rand: () => number, key: string): number {
  for (const p of cands) {
    const res = b.play(p);
    b.undo();
    if (res === 1) return p; // 이기는 수
  }
  // 후보 셋만 깊게, 정확한 점수로 다시 읽는다(좁은 창의 뿌리 점수는 상한일 뿐이라 지는 수도 비슷해 보인다).
  // 예전엔 짧게(32ms) 다시 읽어 비교했는데, 짧은 읽기가 셋 다 "진다"로 보면 아무거나 골라 열린 3을 안 막는 수를 두었다.
  const r = new FastSearcher(b, level.width).searchRoot(level.depth, Math.max(30, level.timeMs * 0.4), true, true, cands);
  const exact = r.scores;
  const val = (x: { p: number; s: number }) => x.s + experienceBonus(key, x.p);
  const ref = exact.find((x) => x.p === bestP);
  if (!ref || exact.length < 2 || ref.s <= -(WIN / 2)) return -1;
  // 다시 읽은 결과가 처음 읽기와 어긋나면(가장 좋은 수가 바뀜 — 바쁠 때 얕게 읽힘) 흔들지 않는다
  if (exact[0].p !== bestP && exact[0].s > ref.s + level.vary!) return -1;
  if (r.stats.depth < Math.min(6, level.depth)) return -1;
  const ok = exact.filter((x) => x.s > -(WIN / 2) && val(x) >= val(ref) - level.vary!);
  return ok.length ? ok[Math.floor(rand() * ok.length)].p : -1;
}
