import type { Cell, GameState, Player, Position } from "./types.ts";
import { AXES, inBounds } from "./config.ts";

/**
 * 착수점을 지나는 4개 축(가로·세로·두 대각선)에서 `player`의 연속 돌을 센다.
 * overlineWins=false(기본)이면 연속 수가 정확히 5인 축이 있어야 승리, true면 5 이상.
 * 승리 줄이 있으면 그 돌 좌표(5개 이상)를, 없으면 null을 돌려준다.
 * 반드시 포획으로 돌을 제거한 뒤의 최종 판을 넘긴다.
 */
export function findFiveInRow(
  board: readonly (readonly Cell[])[],
  position: Position,
  player: Player,
  overlineWins = false,
): Position[] | null {
  const size = board.length;
  if (board[position.row]?.[position.col] !== player) return null;
  for (const [dr, dc] of AXES) {
    const line: Position[] = [{ ...position }];
    for (const sign of [1, -1]) {
      let r = position.row + sign * dr, c = position.col + sign * dc;
      while (inBounds(size, r, c) && board[r][c] === player) {
        line.push({ row: r, col: c });
        r += sign * dr;
        c += sign * dc;
      }
    }
    if (line.length === 5 || (overlineWins && line.length > 5)) {
      return line.sort((a, b) => a.row - b.row || a.col - b.col);
    }
  }
  return null;
}

export function checkFiveInRow(
  board: readonly (readonly Cell[])[],
  position: Position,
  player: Player,
  overlineWins = false,
): boolean {
  return findFiveInRow(board, position, player, overlineWins) !== null;
}

export function capturedBy(state: GameState, player: Player): number {
  return player === "black" ? state.capturedByBlack : state.capturedByWhite;
}

/** 누적 포획 수가 승리 기준(흑 12 / 백 10) 이상인가. 기준을 넘겨도 승리. */
export function checkCaptureVictory(state: GameState, player: Player): boolean {
  return capturedBy(state, player) >= state.config.captureTarget[player];
}
