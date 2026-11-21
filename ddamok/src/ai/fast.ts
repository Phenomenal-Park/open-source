// 따목 AI 전용 고속 판(놓기/되돌리기). 규칙 판정은 src/game 엔진과 정확히 같아야 한다
// (fast.test.ts가 무작위 대국 수천 판으로 두 엔진의 결과를 비교한다). 게임 진행·서버 검증에는 쓰지 않는다.
//
// 형세 점수는 "5칸 창" 단위로 바뀐 부분만 갱신한다: 판 위 모든 5칸 창의 흑·백 돌 수를 들고 있다가,
// 돌 하나가 놓이거나(따여서) 빠지면 그 칸을 지나는 최대 20개 창만 다시 센다.
import type { GameState, Player } from "../game/types.ts";
import { blockedCell, blockedCells } from "../game/rules.ts";

export const EMPTY = 0, BLACK = 1, WHITE = 2;
/** (실험) ⓧ 자리: 아무도 둘 수 없고 줄을 끊는다 */
export const WALL = 3;
export type Color = 1 | 2;
const other = (c: Color): Color => (c === 1 ? 2 : 1);

/** 5칸 창에 한 색만 k개 있을 때의 값(k=5는 승리 판정에서 따로 처리) */
export const WIN_VALUE = [0, 1, 14, 160, 2200, 0];

const DIRS8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const AXES = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;

/** 기본 특징 14개 + 위협 자리 특징 4개(가중치가 18개일 때만 계산) */
export const FEATURE_COUNT = 18;
export const BASE_FEATURES = 14;
export type EvalWeights = readonly number[];

/** 손으로 정한 첫 가중치(자동 조정 전): 내 창은 ×1.15, 따낸 쌍 320, 승리까지 1쌍 2500 · 2쌍 600 */
export const HAND_WEIGHTS: EvalWeights = Object.freeze([
  1 * 1.15, 14 * 1.15, 160 * 1.15, 2200 * 1.15,
  -1, -14, -160, -2200,
  320, -320,
  2500, 600, -2500, -600,
]);

/**
 * 자동 조정한 가중치(scripts/tune-eval.ts, 2회 반복: 고속 AI끼리 510판·형세 9,539개).
 * 1회차 가중치가 손으로 정한 가중치를 40판 중 29승(72.5%, 약 +146점), 2회차가 1회차를 23승(57.5%).
 * 위협 자리 특징 4개를 더한 3회차는 40판 중 16승으로 약해져 채택하지 않았다.
 */
export const TUNED_WEIGHTS: EvalWeights = Object.freeze([0.1, 31.6, 210.6, 2492.3, 1, -18.7, -158.9, -2167.2, 207.2, -150.3, 2462.8, 422.1, -2462.8, -526.1]);

/** 실제로 쓰는 가중치 */
export const DEFAULT_WEIGHTS: EvalWeights = TUNED_WEIGHTS;

interface Undo {
  pos: number;
  color: Color;
  captured: number[];
  /** 이 수가 백의 첫 수라 불사 돌로 정해졌는가 */
  setImmune: boolean;
}

export class FastBoard {
  readonly n: number;
  readonly cells: Int8Array;
  readonly target: [number, number, number];
  /** 색별 6목 이상 승리 여부 [-, 흑, 백] */
  readonly overline: [boolean, boolean, boolean];
  caps: [number, number, number] = [0, 0, 0];
  toMove: Color = BLACK;
  empties: number;
  /** 각 5칸 창의 [흑 수, 백 수] */
  private wb: Int8Array;
  private ww: Int8Array;
  /** 칸 → 그 칸을 지나는 창 번호들 */
  private cellWindows: Int32Array[];
  /** 창 번호 → 방향(0~3) */
  private windowAxis: Int8Array;
  /** 창 개수: cnt[색 × 5 + k] = 그 색만 k개(1~4) 있는 5칸 창의 수 */
  readonly cnt = new Int32Array(15);
  /** 형세 가중치(EVAL_WEIGHTS 기본, 자동 조정 결과로 바꿀 수 있다) */
  weights: EvalWeights = DEFAULT_WEIGHTS;
  /** 색별 "4개 + 빈칸 1" 창 수(바로 이길 수 있는 자리의 근사) */
  fours: [number, number, number] = [0, 0, 0];
  /** 근처(2칸 이내) 돌 수 — 후보 수 */
  near: Int16Array;
  hash = 0;
  private zobrist: Int32Array;
  private stack: Undo[] = [];

  /** (실험용) 백 첫 돌 불사 규칙: 켜져 있으면 백의 첫 돌 칸(없으면 -1) */
  readonly whiteImmuneRule: boolean;
  immune = -1;
  /** 이 판을 만들 때까지 둔 수(백의 첫 수를 알아보기 위해) */
  baseMoves = 0;

  constructor(n: number, target: [number, number] = [12, 10], overlineWins = false, whiteOverlineWins = false, whiteImmuneRule = false) {
    this.n = n;
    this.cells = new Int8Array(n * n);
    this.target = [0, target[0], target[1]];
    this.overline = [false, overlineWins, overlineWins || whiteOverlineWins];
    this.whiteImmuneRule = whiteImmuneRule;
    this.empties = n * n;
    this.near = new Int16Array(n * n);
    this.anchorAt = new Uint8Array(n * n);
    const windows: number[][] = [];
    const axisOf: number[] = [];
    for (const [ai, [dr, dc]] of AXES.entries()) {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const er = r + 4 * dr, ec = c + 4 * dc;
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        windows.push([0, 1, 2, 3, 4].map((i) => (r + i * dr) * n + (c + i * dc)));
        axisOf.push(ai);
      }
    }
    const per: number[][] = Array.from({ length: n * n }, () => []);
    windows.forEach((w, i) => w.forEach((cell) => per[cell].push(i)));
    this.cellWindows = per.map((x) => Int32Array.from(x));
    this.windowAxis = Int8Array.from(axisOf);
    this.wb = new Int8Array(windows.length);
    this.ww = new Int8Array(windows.length);
    let seed = 0x9e3779b9;
    this.zobrist = new Int32Array(n * n * 3);
    for (let i = 0; i < this.zobrist.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      this.zobrist[i] = seed;
    }
  }

  static fromState(s: GameState): FastBoard {
    const n = s.config.boardSize;
    const b = new FastBoard(n, [s.config.captureTarget.black, s.config.captureTarget.white], s.config.overlineWins, s.config.whiteOverlineWins, s.config.whiteFirstStoneImmune);
    b.baseMoves = s.moveCount;
    if (s.config.whiteFirstStoneImmune && s.moves.length >= 2) b.immune = s.moves[1].row * n + s.moves[1].col;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = s.board[r][c];
      if (v) b.put(r * n + c, v === "black" ? BLACK : WHITE);
    }
    // 중립 칸: 흑 ⓧ(초록돌 규칙이면 받침) + 랜덤 매직스톤(늘 받침)
    const own = blockedCell(s);
    for (const wall of blockedCells(s)) {
      const isOwn = !!own && own.row === wall.row && own.col === wall.col;
      b.addWall(wall.row * n + wall.col, isOwn ? !!s.config.greenStone : true);
    }
    if (s.config.blackBlock && s.scan === null && !s.isFinished) b.setWallAvail(true);
    // (실험) 백 지뢰(백이 보는 판에서만): 백은 그 자리에 못 두고, 흑이 두면 중립 돌이 된다 → 양쪽 모두에게 막힌 칸으로 본다
    const mn = s.mine;
    if (mn && !mn.triggered && mn.pos.row >= 0) b.addWall(mn.pos.row * n + mn.pos.col, false);
    b.wallAnchor = !!s.config.greenStone;
    b.wallCosts = !!s.config.scanCostsMove;
    // 백이 보는 판: 아직 안 드러난 숨은 돌 자리(흑은 그 돌로 생긴 위협을 모른다)
    const h = s.hidden;
    if (h && !h.revealed && h.pos.row >= 0 && s.board[h.pos.row][h.pos.col] === "white") b.hiddenCell = h.pos.row * n + h.pos.col;
    b.caps = [0, s.capturedByBlack, s.capturedByWhite];
    b.toMove = s.currentPlayer === "black" ? BLACK : WHITE;
    return b;
  }

  /**
   * 가정해 보기용: 따내기 없이 돌 하나를 놓는다/뺀다(창 점수·근처 칸까지 함께 고친다).
   * cells를 직접 바꾸면 근처 칸 표시가 안 바뀌어 winningMoves가 그 돌 둘레의 이기는 수를 놓친다.
   */
  place(pos: number, color: Color) { this.put(pos, color); }
  unplace(pos: number) { this.remove(pos); }

  /** (실험) 빈칸 pos를 ⓧ로 막는다: 그 칸을 지나는 창은 양쪽 모두에게 죽은 창이 된다(흑·백이 섞인 창처럼) */
  addWall(pos: number, anchor = this.wallAnchor) {
    this.anchorAt[pos] = anchor ? 1 : 0;
    for (const w of this.cellWindows[pos]) {
      const b = this.wb[w], wh = this.ww[w];
      if (!wh && b && b < 5) { this.cnt[5 + b]--; if (b === 4) this.fours[1]--; }
      if (!b && wh && wh < 5) { this.cnt[10 + wh]--; if (wh === 4) this.fours[2]--; }
      this.wb[w]++; this.ww[w]++;
    }
    this.cells[pos] = WALL;
    this.empties--;
    this.hash ^= 0x5bd1e995 ^ pos;
  }

  /** addWall 되돌리기(수읽기 안에서 흑의 ⓧ를 가정해 볼 때) */
  removeWall(pos: number) {
    for (const w of this.cellWindows[pos]) {
      this.wb[w]--; this.ww[w]--;
      const b = this.wb[w], wh = this.ww[w];
      if (!wh && b && b < 5) { this.cnt[5 + b]++; if (b === 4) this.fours[1]++; }
      if (!b && wh && wh < 5) { this.cnt[10 + wh]++; if (wh === 4) this.fours[2]++; }
    }
    this.cells[pos] = EMPTY;
    this.empties++;
    this.hash ^= 0x5bd1e995 ^ pos;
  }

  /** (실험) 흑이 놓는 ⓧ 칸이 초록돌(양쪽 모두의 따내기 받침)인가 */
  wallAnchor = false;
  /** 칸별: 중립 칸이 따내기 받침인가(ⓧ는 규칙에 따라, 랜덤 매직스톤은 늘) */
  private anchorAt = new Uint8Array(0);
  /** (실험) ⓧ/매직스톤을 쓰면 차례가 넘어가는가 */
  wallCosts = false;
  /** 차례만 넘긴다(수읽기에서 "턴을 쓰는 매직스톤"을 가정할 때, 기록은 남기지 않는다) */
  passTurn() { this.toMove = other(this.toMove); this.hash ^= 1; }

  /** 초록돌을 놓으면 흑이 바로 이어서 백 두 점을 따낼 수 있게 되는 빈칸(최대 k곳): 백 두 점의 한쪽 끝, 다른 끝은 빈칸이나 흑 */
  greenCaptureCells(k: number): number[] {
    const n = this.n, out: number[] = [];
    for (const g of this.candidates()) {
      if (this.cells[g]) continue;
      const r = (g / n) | 0, c = g % n;
      for (const [dr, dc] of DIRS8) {
        const r3 = r + 3 * dr, c3 = c + 3 * dc;
        if (r3 < 0 || r3 >= n || c3 < 0 || c3 >= n) continue;
        const e = this.cells[r3 * n + c3];
        if (this.cells[(r + dr) * n + c + dc] === WHITE && this.cells[(r + 2 * dr) * n + c + 2 * dc] === WHITE && (e === EMPTY || e === BLACK)) { out.push(g); break; }
      }
      if (out.length >= k) break;
    }
    return out;
  }

  /** 백 숨은 돌 칸(백이 보는 판에서만, 없으면 -1) */
  hiddenCell = -1;

  /** 흑 눈에 보이는 백의 이길 자리: 숨은 돌이 없다고 쳐도 이길 자리인가 */
  visibleThreat(t: number): boolean {
    const hc = this.hiddenCell;
    if (hc < 0 || this.cells[hc] !== WHITE) return true;
    this.remove(hc);
    const r = this.winningMoves(2).includes(t);
    this.put(hc, WHITE);
    return r;
  }

  /** (실험) 흑이 아직 ⓧ를 쓸 수 있는가 — 수읽기는 "백의 결정타(막을 곳 둘 이상)를 흑이 ⓧ+착수로 막는" 경우까지 본다 */
  wallAvail = false;
  setWallAvail(v: boolean) {
    if (v !== this.wallAvail) { this.wallAvail = v; this.hash ^= 0x2545f491; }
  }

  /** 돌 하나 놓기/빼기의 기본 처리(창 점수·근처·해시) */
  private put(pos: number, color: Color) {
    for (const w of this.cellWindows[pos]) {
      const b = this.wb[w], wh = this.ww[w];
      // 이전 값 빼기
      if (!wh && b && b < 5) { this.cnt[5 + b]--; if (b === 4) this.fours[1]--; }
      if (!b && wh && wh < 5) { this.cnt[10 + wh]--; if (wh === 4) this.fours[2]--; }
      if (color === BLACK) this.wb[w]++; else this.ww[w]++;
      const b2 = this.wb[w], w2 = this.ww[w];
      if (!w2 && b2 && b2 < 5) { this.cnt[5 + b2]++; if (b2 === 4) this.fours[1]++; }
      if (!b2 && w2 && w2 < 5) { this.cnt[10 + w2]++; if (w2 === 4) this.fours[2]++; }
    }
    this.cells[pos] = color;
    this.empties--;
    this.hash ^= this.zobrist[pos * 3 + color];
    this.touchNear(pos, 1);
  }

  private remove(pos: number) {
    const color = this.cells[pos] as Color;
    for (const w of this.cellWindows[pos]) {
      const b = this.wb[w], wh = this.ww[w];
      if (!wh && b && b < 5) { this.cnt[5 + b]--; if (b === 4) this.fours[1]--; }
      if (!b && wh && wh < 5) { this.cnt[10 + wh]--; if (wh === 4) this.fours[2]--; }
      if (color === BLACK) this.wb[w]--; else this.ww[w]--;
      const b2 = this.wb[w], w2 = this.ww[w];
      if (!w2 && b2 && b2 < 5) { this.cnt[5 + b2]++; if (b2 === 4) this.fours[1]++; }
      if (!b2 && w2 && w2 < 5) { this.cnt[10 + w2]++; if (w2 === 4) this.fours[2]++; }
    }
    this.cells[pos] = EMPTY;
    this.empties++;
    this.hash ^= this.zobrist[pos * 3 + color];
    this.touchNear(pos, -1);
  }

  private touchNear(pos: number, d: number) {
    const n = this.n, r0 = (pos / n) | 0, c0 = pos % n;
    for (let r = Math.max(0, r0 - 2); r <= Math.min(n - 1, r0 + 2); r++)
      for (let c = Math.max(0, c0 - 2); c <= Math.min(n - 1, c0 + 2); c++) this.near[r * n + c] += d;
  }

  /** color가 빈칸 pos에 두면 따낼 돌들(src/game/captures.ts와 같은 규칙) */
  capturesAt(pos: number, color: Color, out: number[] = []): number[] {
    const n = this.n, r = (pos / n) | 0, c = pos % n, enemy = other(color);
    for (const [dr, dc] of DIRS8) {
      const r3 = r + 3 * dr, c3 = c + 3 * dc;
      if (r3 < 0 || r3 >= n || c3 < 0 || c3 >= n) continue;
      const p1 = (r + dr) * n + c + dc, p2 = (r + 2 * dr) * n + c + 2 * dc;
      const e3 = this.cells[r3 * n + c3];
      if (this.cells[p1] === enemy && this.cells[p2] === enemy && (e3 === color || (e3 === WALL && this.anchorAt[r3 * n + c3] === 1)) && p1 !== this.immune && p2 !== this.immune) out.push(p1, p2);
    }
    return out;
  }

  /** pos를 지나는 color의 연속 돌이 정확히 5(장목 승리 설정이면 5 이상)인가 */
  isFive(pos: number, color: Color): boolean {
    const n = this.n, r = (pos / n) | 0, c = pos % n;
    for (const [dr, dc] of AXES) {
      let k = 1;
      for (const s of [1, -1]) {
        let rr = r + s * dr, cc = c + s * dc;
        while (rr >= 0 && rr < n && cc >= 0 && cc < n && this.cells[rr * n + cc] === color) { k++; rr += s * dr; cc += s * dc; }
      }
      if (k === 5 || (this.overline[color] && k > 5)) return true;
    }
    return false;
  }

  /** 둘 차례인 사람이 pos에 둔다. 0 = 계속, 1 = 이번 수로 승리, 2 = 무승부 */
  play(pos: number): 0 | 1 | 2 {
    const color = this.toMove;
    const captured = this.capturesAt(pos, color);
    this.put(pos, color);
    for (const p of captured) this.remove(p);
    this.caps[color] += captured.length;
    // (실험용) 백의 첫 수(전체 2수째)는 이후 절대 따이지 않는다
    const setImmune = this.whiteImmuneRule && this.immune < 0 && color === WHITE && this.baseMoves + this.stack.length === 1;
    if (setImmune) this.immune = pos;
    this.stack.push({ pos, color, captured, setImmune });
    this.toMove = other(color);
    this.hash ^= 1;
    if (this.caps[color] >= this.target[color] || this.isFive(pos, color)) return 1;
    return this.empties === 0 ? 2 : 0;
  }

  undo() {
    const u = this.stack.pop()!;
    if (u.setImmune) this.immune = -1;
    for (const p of u.captured) this.put(p, other(u.color));
    this.caps[u.color] -= u.captured.length;
    this.remove(u.pos);
    this.toMove = u.color;
    this.hash ^= 1;
  }

  /** color가 지금 두면 바로 이기는 빈칸(5목 또는 포획 승리) */
  winningMoves(color: Color, out: number[] = []): number[] {
    const need = this.target[color] - this.caps[color];
    for (let p = 0; p < this.cells.length; p++) {
      if (this.cells[p] || !this.near[p]) continue;
      if (need <= 4 && this.capturesAt(p, color).length >= need) { out.push(p); continue; }
      this.cells[p] = color;
      const five = this.isFive(p, color);
      this.cells[p] = EMPTY;
      if (five) out.push(p);
    }
    return out;
  }

  /** 빈칸 pos의 빠른 점수: 두는 쪽 창 이득 + 상대 창 막기 + 따내기 + 따일 위험 */
  moveScore(pos: number, color: Color): number {
    let s = 0;
    for (const w of this.cellWindows[pos]) {
      const mine = color === BLACK ? this.wb[w] : this.ww[w];
      const theirs = color === BLACK ? this.ww[w] : this.wb[w];
      if (!theirs) s += (mine === 4 ? 100_000 : WIN_VALUE[mine + 1] - WIN_VALUE[mine]);
      if (!mine && theirs) s += theirs === 4 ? 50_000 : WIN_VALUE[theirs] * (theirs >= 3 ? 1.2 : 0.8);
    }
    const capMine = this.capturesAt(pos, color).length;
    if (capMine) s += this.caps[color] + capMine >= this.target[color] ? 200_000 : 350 * capMine;
    const capTheirs = this.capturesAt(pos, other(color)).length;
    if (capTheirs) s += this.caps[other(color)] + capTheirs >= this.target[other(color)] ? 100_000 : 250 * capTheirs;
    return s;
  }

  /** color가 pos에 두면 "4개 + 빈칸 1" 창이 생기는가(넉 점을 만드는 수 — 연속 위협 후보) */
  makesFour(pos: number, color: Color): boolean {
    for (const w of this.cellWindows[pos]) {
      const mine = color === BLACK ? this.wb[w] : this.ww[w];
      const theirs = color === BLACK ? this.ww[w] : this.wb[w];
      if (mine === 3 && !theirs) return true;
    }
    return false;
  }

  /**
   * 형세 특징(둘 차례 입장): [내 창 1~4개 수(4), 상대 창 1~4개 수(4), 내 따낸 쌍, 상대 따낸 쌍,
   * 내 승리까지 1쌍 남음, 2쌍 남음, 상대 1쌍 남음, 2쌍 남음]
   */
  features(out: Float64Array = new Float64Array(FEATURE_COUNT)): Float64Array {
    const me = this.toMove, op = other(me);
    for (let k = 1; k <= 4; k++) {
      out[k - 1] = this.cnt[me * 5 + k];
      out[3 + k] = this.cnt[op * 5 + k];
    }
    const left = (c: Color) => (this.target[c] - this.caps[c]) / 2;
    out[8] = this.caps[me] / 2;
    out[9] = this.caps[op] / 2;
    out[10] = left(me) <= 1 ? 1 : 0;
    out[11] = left(me) === 2 ? 1 : 0;
    out[12] = left(op) <= 1 ? 1 : 0;
    out[13] = left(op) === 2 ? 1 : 0;
    if (out.length > BASE_FEATURES) {
      // 위협 자리: 두면 넉 점이 되는 빈칸 수, 두 방향 이상으로 동시에 넉 점이 되는 빈칸 수
      let f1 = 0, f2 = 0, o1 = 0, o2 = 0;
      for (let p = 0; p < this.cells.length; p++) {
        if (this.cells[p] || !this.near[p]) continue;
        let am = 0, ao = 0;
        for (const w of this.cellWindows[p]) {
          const bit = 1 << this.windowAxis[w];
          const b = this.wb[w], wh = this.ww[w];
          const mine = me === BLACK ? b : wh, theirs = me === BLACK ? wh : b;
          if (mine === 3 && !theirs) am |= bit;
          if (theirs === 3 && !mine) ao |= bit;
        }
        if (am) { f1++; if (am & (am - 1)) f2++; }
        if (ao) { o1++; if (ao & (ao - 1)) o2++; }
      }
      out[14] = f1; out[15] = f2; out[16] = o1; out[17] = o2;
    }
    return out;
  }

  private featBase = new Float64Array(BASE_FEATURES);
  private featFull = new Float64Array(FEATURE_COUNT);

  /** 형세(둘 차례 입장) = 특징 · 가중치. 가중치가 기본 14개뿐이면 위협 자리 계산을 건너뛴다(빠름) */
  evaluate(): number {
    const w = this.weights;
    const f = this.features(w.length > BASE_FEATURES ? this.featFull : this.featBase);
    let v = 0;
    for (let i = 0; i < f.length; i++) v += f[i] * w[i];
    return v;
  }

  candidates(): number[] {
    const out: number[] = [];
    for (let p = 0; p < this.cells.length; p++) if (!this.cells[p] && this.near[p]) out.push(p);
    if (!out.length) out.push(((this.n / 2) | 0) * this.n + ((this.n / 2) | 0));
    return out;
  }

  stoneAt(pos: number): Player | null {
    const v = this.cells[pos];
    return v === BLACK ? "black" : v === WHITE ? "white" : null;
  }
}
