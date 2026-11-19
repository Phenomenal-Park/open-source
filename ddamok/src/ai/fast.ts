// 따목 AI 전용 고속 판(놓기/되돌리기). 규칙 판정은 src/game 엔진과 정확히 같아야 한다
// (fast.test.ts가 무작위 대국 수천 판으로 두 엔진의 결과를 비교한다). 게임 진행·서버 검증에는 쓰지 않는다.
//
// 형세 점수는 "5칸 창" 단위로 바뀐 부분만 갱신한다: 판 위 모든 5칸 창의 흑·백 돌 수를 들고 있다가,
// 돌 하나가 놓이거나(따여서) 빠지면 그 칸을 지나는 최대 20개 창만 다시 센다.
import type { GameState, Player } from "../game/types.ts";

export const EMPTY = 0, BLACK = 1, WHITE = 2;
export type Color = 1 | 2;
const other = (c: Color): Color => (c === 1 ? 2 : 1);

/** 5칸 창에 한 색만 k개 있을 때의 값(k=5는 승리 판정에서 따로 처리) */
export const WIN_VALUE = [0, 1, 14, 160, 2200, 0];

const DIRS8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const AXES = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;

interface Undo {
  pos: number;
  color: Color;
  captured: number[];
}

export class FastBoard {
  readonly n: number;
  readonly cells: Int8Array;
  readonly target: [number, number, number];
  readonly overlineWins: boolean;
  caps: [number, number, number] = [0, 0, 0];
  toMove: Color = BLACK;
  empties: number;
  /** 각 5칸 창의 [흑 수, 백 수] */
  private wb: Int8Array;
  private ww: Int8Array;
  /** 칸 → 그 칸을 지나는 창 번호들 */
  private cellWindows: Int32Array[];
  /** 색별 창 점수 합 */
  score: [number, number, number] = [0, 0, 0];
  /** 색별 "4개 + 빈칸 1" 창 수(바로 이길 수 있는 자리의 근사) */
  fours: [number, number, number] = [0, 0, 0];
  /** 근처(2칸 이내) 돌 수 — 후보 수 */
  near: Int16Array;
  hash = 0;
  private zobrist: Int32Array;
  private stack: Undo[] = [];

  constructor(n: number, target: [number, number] = [12, 10], overlineWins = false) {
    this.n = n;
    this.cells = new Int8Array(n * n);
    this.target = [0, target[0], target[1]];
    this.overlineWins = overlineWins;
    this.empties = n * n;
    this.near = new Int16Array(n * n);
    const windows: number[][] = [];
    for (const [dr, dc] of AXES) {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const er = r + 4 * dr, ec = c + 4 * dc;
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        windows.push([0, 1, 2, 3, 4].map((i) => (r + i * dr) * n + (c + i * dc)));
      }
    }
    const per: number[][] = Array.from({ length: n * n }, () => []);
    windows.forEach((w, i) => w.forEach((cell) => per[cell].push(i)));
    this.cellWindows = per.map((x) => Int32Array.from(x));
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
    const b = new FastBoard(n, [s.config.captureTarget.black, s.config.captureTarget.white], s.config.overlineWins);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = s.board[r][c];
      if (v) b.put(r * n + c, v === "black" ? BLACK : WHITE);
    }
    b.caps = [0, s.capturedByBlack, s.capturedByWhite];
    b.toMove = s.currentPlayer === "black" ? BLACK : WHITE;
    return b;
  }

  /** 돌 하나 놓기/빼기의 기본 처리(창 점수·근처·해시) */
  private put(pos: number, color: Color) {
    for (const w of this.cellWindows[pos]) {
      const b = this.wb[w], wh = this.ww[w];
      // 이전 값 빼기
      if (!wh && b) { this.score[1] -= WIN_VALUE[b]; if (b === 4) this.fours[1]--; }
      if (!b && wh) { this.score[2] -= WIN_VALUE[wh]; if (wh === 4) this.fours[2]--; }
      if (color === BLACK) this.wb[w]++; else this.ww[w]++;
      const b2 = this.wb[w], w2 = this.ww[w];
      if (!w2 && b2) { this.score[1] += WIN_VALUE[b2]; if (b2 === 4) this.fours[1]++; }
      if (!b2 && w2) { this.score[2] += WIN_VALUE[w2]; if (w2 === 4) this.fours[2]++; }
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
      if (!wh && b) { this.score[1] -= WIN_VALUE[b]; if (b === 4) this.fours[1]--; }
      if (!b && wh) { this.score[2] -= WIN_VALUE[wh]; if (wh === 4) this.fours[2]--; }
      if (color === BLACK) this.wb[w]--; else this.ww[w]--;
      const b2 = this.wb[w], w2 = this.ww[w];
      if (!w2 && b2) { this.score[1] += WIN_VALUE[b2]; if (b2 === 4) this.fours[1]++; }
      if (!b2 && w2) { this.score[2] += WIN_VALUE[w2]; if (w2 === 4) this.fours[2]++; }
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
      if (this.cells[p1] === enemy && this.cells[p2] === enemy && this.cells[r3 * n + c3] === color) out.push(p1, p2);
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
      if (k === 5 || (this.overlineWins && k > 5)) return true;
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
    this.stack.push({ pos, color, captured });
    this.toMove = other(color);
    this.hash ^= 1;
    if (this.caps[color] >= this.target[color] || this.isFive(pos, color)) return 1;
    return this.empties === 0 ? 2 : 0;
  }

  undo() {
    const u = this.stack.pop()!;
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

  /** 형세 판단에 "지금 따낼 수 있는 자리"를 넣을지(실험 결과에 따라 켠다) */
  captureEval = true;

  /** 형세(둘 차례 입장) */
  evaluate(): number {
    const me = this.toMove, op = other(me);
    const capVal = (c: Color) => {
      const left = (this.target[c] - this.caps[c]) / 2;
      return (this.caps[c] / 2) * 320 + (left <= 1 ? 2500 : left <= 2 ? 600 : 0);
    };
    let v = this.score[me] * 1.15 - this.score[op] + capVal(me) - capVal(op);
    if (this.captureEval) {
      // 내 차례에 따낼 수 있는 자리 = 곧 얻을 점수, 상대가 따낼 수 있는 자리 = 내 약점(한 번에 하나만 막을 수 있다)
      let mine = 0, theirs = 0;
      const tmp: number[] = [];
      for (let p = 0; p < this.cells.length; p++) {
        if (this.cells[p] || !this.near[p]) continue;
        tmp.length = 0;
        if (this.capturesAt(p, me, tmp).length) mine = Math.max(mine, tmp.length);
        tmp.length = 0;
        if (this.capturesAt(p, op, tmp).length) theirs += tmp.length / 2;
      }
      v += (mine / 2) * 200 - Math.min(theirs, 3) * 120;
    }
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
