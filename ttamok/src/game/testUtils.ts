// 테스트 전용 도우미. 다이어그램으로 판을 만든다.
//   X = 흑, O = 백, . = 빈칸. 다이어그램은 판의 왼쪽 위(0,0)부터 채워지고 나머지는 빈칸.
import type { GameState, Player, Position } from "./types.ts";
import { createGame } from "./gameState.ts";
import { applyMove } from "./rules.ts";

export function fromDiagram(
  rows: string[],
  toMove: Player = "black",
  opts: { size?: number; capturedByBlack?: number; capturedByWhite?: number; overlineWins?: boolean } = {},
): GameState {
  const state = createGame(opts.size ?? 15, { overlineWins: opts.overlineWins });
  rows.forEach((line, r) => {
    [...line.replace(/\s+/g, "")].forEach((ch, c) => {
      if (ch === "X") state.board[r][c] = "black";
      else if (ch === "O") state.board[r][c] = "white";
      else if (ch !== ".") throw new Error(`bad diagram char ${ch}`);
    });
  });
  state.currentPlayer = toMove;
  state.capturedByBlack = opts.capturedByBlack ?? 0;
  state.capturedByWhite = opts.capturedByWhite ?? 0;
  return state;
}

export const at = (row: number, col: number): Position => ({ row, col });

/** 차례를 지키며 여러 수를 순서대로 둔다. 하나라도 둘 수 없으면 예외. */
export function play(state: GameState, ...moves: Position[]): GameState {
  for (const m of moves) {
    const next = applyMove(state, m);
    if (next === state) throw new Error(`illegal move ${JSON.stringify(m)} at move ${state.moveCount + 1}`);
    state = next;
  }
  return state;
}

export function stoneCount(state: GameState, player: Player): number {
  return state.board.flat().filter((c) => c === player).length;
}
