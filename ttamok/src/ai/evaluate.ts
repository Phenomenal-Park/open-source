// 따목 AI — 형세 판단. 규칙 판정은 하지 않는다(그건 src/game 엔진이 한다).
import type { Cell, GameState, Player, Position } from "../game/types.ts";
import { AXES, DIRECTIONS, inBounds, opponent } from "../game/config.ts";
import { getCapturedStones } from "../game/captures.ts";
import { capturedBy } from "../game/victory.ts";

/** 5칸 창 안에 한 색만 k개 있을 때의 값. 5개(=장목 일부)는 승리가 아니므로 0. */
export const WINDOW_VALUE = [0, 1, 12, 150, 2000, 0] as const;
export const PAIR_VALUE = 320;
export const WIN_SCORE = 10_000_000;

type Board = readonly (readonly Cell[])[];

/** 판 위의 모든 5칸 창을 한 번 훑어 양쪽의 줄 모양 점수를 센다. */
export function windowScores(board: Board): Record<Player, number> {
  const n = board.length;
  const out = { black: 0, white: 0 };
  for (const [dr, dc] of AXES) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const er = r + 4 * dr, ec = c + 4 * dc;
        if (!inBounds(n, er, ec)) continue;
        let b = 0, w = 0;
        for (let i = 0; i < 5; i++) {
          const v = board[r + i * dr][c + i * dc];
          if (v === "black") b++;
          else if (v === "white") w++;
        }
        if (b && !w) out.black += WINDOW_VALUE[b];
        else if (w && !b) out.white += WINDOW_VALUE[w];
      }
    }
  }
  return out;
}

/** 포획 진행도의 값: 승리 목표에 가까울수록 한 쌍의 값이 커진다. */
export function captureProgress(state: GameState, p: Player): number {
  const pairs = capturedBy(state, p) / 2;
  const left = Math.max(0, (state.config.captureTarget[p] - capturedBy(state, p)) / 2);
  return pairs * PAIR_VALUE + (left === 1 ? 1500 : left === 2 ? 400 : 0);
}

/** 빈칸 c에 p를 두면 따낼 수 있는 돌 수 */
export function capturesAt(board: Board, c: Position, p: Player): number {
  return getCapturedStones(board, c, p).length;
}

/** 돌이 놓인 곳에서 2칸 이내의 빈칸(첫 수는 가운데). */
export function candidateMoves(board: Board): Position[] {
  const n = board.length;
  const near = new Uint8Array(n * n);
  let any = false;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!board[r][c]) continue;
      any = true;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (inBounds(n, rr, cc) && !board[rr][cc]) near[rr * n + cc] = 1;
        }
      }
    }
  }
  if (!any) return [{ row: Math.floor(n / 2), col: Math.floor(n / 2) }];
  const out: Position[] = [];
  for (let i = 0; i < near.length; i++) if (near[i]) out.push({ row: Math.floor(i / n), col: i % n });
  return out;
}

/**
 * 수 하나의 빠른 점수(수 정렬·약한 AI의 판단용). 공격(내 창이 커짐)과 방어(상대 창을 막음),
 * 따내기, 상대의 따내기 자리 선점, 내 돌이 따이기 쉬운 모양이 되는 위험을 함께 본다.
 */
export function quickScore(state: GameState, c: Position, me: Player): number {
  const board = state.board;
  const n = board.length;
  const opp = opponent(me);
  let score = 0;

  // 줄 모양: c를 지나는 5칸 창들
  for (const [dr, dc] of AXES) {
    for (let s = -4; s <= 0; s++) {
      const sr = c.row + s * dr, sc = c.col + s * dc;
      const er = sr + 4 * dr, ec = sc + 4 * dc;
      if (!inBounds(n, sr, sc) || !inBounds(n, er, ec)) continue;
      let mine = 0, theirs = 0;
      for (let i = 0; i < 5; i++) {
        const v = board[sr + i * dr][sc + i * dc];
        if (v === me) mine++;
        else if (v === opp) theirs++;
      }
      if (!theirs) score += WINDOW_VALUE[Math.min(mine + 1, 4)] * (mine + 1 >= 5 ? 50 : 1) - WINDOW_VALUE[mine];
      if (!mine && theirs) score += WINDOW_VALUE[theirs] * (theirs >= 3 ? 1.1 : 0.9);
    }
  }

  // 따내기와 상대 따내기 자리 선점
  const myCap = capturesAt(board, c, me);
  if (myCap) {
    const after = capturedBy(state, me) + myCap;
    score += after >= state.config.captureTarget[me] ? WIN_SCORE / 10 : (myCap / 2) * PAIR_VALUE * 1.6;
  }
  const theirCap = capturesAt(board, c, opp);
  if (theirCap) {
    const after = capturedBy(state, opp) + theirCap;
    score += after >= state.config.captureTarget[opp] ? WIN_SCORE / 20 : (theirCap / 2) * PAIR_VALUE * 1.2;
  }

  // 위험: c에 두면 [상대][나][나(c)][빈칸] 또는 그 반대 모양이 되어 바로 따일 수 있는가
  for (const [dr, dc] of DIRECTIONS) {
    const r1 = c.row + dr, c1 = c.col + dc; // 내 옆 돌
    const rb = c.row - dr, cb = c.col - dc; // 내 뒤
    const r2 = c.row + 2 * dr, c2 = c.col + 2 * dc; // 짝 너머
    if (!inBounds(n, r1, c1) || !inBounds(n, rb, cb) || !inBounds(n, r2, c2)) continue;
    if (board[r1][c1] !== me) continue;
    const back = board[rb][cb], front = board[r2][c2];
    if ((back === opp && front === null) || (back === null && front === opp)) score -= PAIR_VALUE * 0.8;
  }
  return score;
}

/** 말단 평가: 둘 차례인 사람(toMove) 입장의 점수. */
export function evaluate(state: GameState): number {
  const me = state.currentPlayer;
  const opp = opponent(me);
  const w = windowScores(state.board);
  let score = w[me] * 1.2 - w[opp];
  score += captureProgress(state, me) - captureProgress(state, opp);
  // 지금 바로 따낼 수 있는 자리(내 차례라 실제 위협) / 상대가 노리는 자리
  let mineNow = 0, theirsNow = 0;
  for (const c of candidateMoves(state.board)) {
    if (capturesAt(state.board, c, me)) mineNow++;
    if (capturesAt(state.board, c, opp)) theirsNow++;
  }
  score += Math.min(mineNow, 2) * PAIR_VALUE * 0.6 - theirsNow * PAIR_VALUE * 0.3;
  return score;
}

/**
 * 수읽기에서 절대 빠뜨리면 안 되는 자리: c를 지나는 창에 한 색이 3개 이상(넉 점·5목을 만들거나 막는 자리),
 * 또는 c에 두면 따내기로 이기거나(내 쪽) 상대가 따내기로 이기는 자리.
 */
export function isUrgent(state: GameState, c: Position, me: Player): boolean {
  const board = state.board;
  const n = board.length;
  const opp = opponent(me);
  for (const [dr, dc] of AXES) {
    for (let s = -4; s <= 0; s++) {
      const sr = c.row + s * dr, sc = c.col + s * dc;
      const er = sr + 4 * dr, ec = sc + 4 * dc;
      if (!inBounds(n, sr, sc) || !inBounds(n, er, ec)) continue;
      let mine = 0, theirs = 0;
      for (let i = 0; i < 5; i++) {
        const v = board[sr + i * dr][sc + i * dc];
        if (v === me) mine++;
        else if (v === opp) theirs++;
      }
      if ((mine >= 3 && !theirs) || (theirs >= 3 && !mine)) return true;
    }
  }
  for (const p of [me, opp]) {
    const cap = capturesAt(board, c, p);
    if (cap && capturedBy(state, p) + cap >= state.config.captureTarget[p]) return true;
  }
  return false;
}
