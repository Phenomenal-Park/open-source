import type { GameState, IllegalReason, MoveResult, Player, Position } from "./types.ts";
import { inBounds, opponent } from "./config.ts";
import { getCapturedStones } from "./captures.ts";
import { checkCaptureVictory, findFiveInRow } from "./victory.ts";

export function whyIllegal(state: GameState, position: Position, player: Player = state.currentPlayer): IllegalReason | null {
  if (state.isFinished) return "finished";                                   // 1. 종료 여부
  if (player !== state.currentPlayer) return "not-your-turn";                // 2. 차례
  const { row, col } = position;
  if (!Number.isInteger(row) || !Number.isInteger(col) || !inBounds(state.config.boardSize, row, col)) {
    return "out-of-bounds";                                                  // 3. 판 내부
  }
  if (state.board[row][col] !== null) return "occupied";                    // 4. 빈 교차점
  return null;
}

export function isLegalMove(state: GameState, position: Position, player: Player = state.currentPlayer): boolean {
  return whyIllegal(state, position, player) === null;
}

/**
 * 착수 한 번을 처리한다(지시서 §6 순서). 원본 state는 수정하지 않는다.
 * `player`를 넘기면 서버처럼 "누가 두려 하는지"까지 검증한다.
 */
export function tryMove(state: GameState, position: Position, player: Player = state.currentPlayer): MoveResult {
  const reason = whyIllegal(state, position, player);
  if (reason) return { ok: false, reason };

  const me = state.currentPlayer;
  const pos = { row: position.row, col: position.col };

  // 5. 착수
  const board = state.board.map((r) => r.slice());
  board[pos.row][pos.col] = me;

  // 6–7. 이번 착수점 기준 8방향 포획 대상 수집
  const captured = getCapturedStones(board, pos, me);

  // 8. 동시에 제거
  for (const { row, col } of captured) board[row][col] = null;

  // 9. 누적 포획 수 갱신
  const capturedByBlack = state.capturedByBlack + (me === "black" ? captured.length : 0);
  const capturedByWhite = state.capturedByWhite + (me === "white" ? captured.length : 0);

  const next: GameState = {
    config: state.config,
    board,
    currentPlayer: me,
    capturedByBlack,
    capturedByWhite,
    moveCount: state.moveCount + 1,
    lastMove: pos,
    lastCaptured: captured,
    moves: [...state.moves, pos],
    winner: null,
    winReason: null,
    winningLine: null,
    isFinished: false,
  };

  // 10. 포획 승리
  const captureWin = checkCaptureVictory(next, me);
  // 11. 포획 후 최종 판에서 5목
  const line = findFiveInRow(board, pos, me, state.config.overlineWins);

  if (captureWin || line) {
    // 12. 승리 → 종료. 같은 수에 둘 다 달성하면 처리 순서상 먼저 확인한 포획 승리로 기록하고 5목 줄도 남긴다.
    next.winner = me;
    next.winReason = captureWin ? "capture" : "five";
    next.winningLine = line;
    next.isFinished = true;
  } else if (!board.some((row) => row.includes(null))) {
    // 판이 다 찼고(포획으로 생긴 빈칸도 없음) 승자가 없으면 무승부
    next.winReason = "draw";
    next.isFinished = true;
  } else {
    // 13. 차례 넘김
    next.currentPlayer = opponent(me);
  }
  return { ok: true, state: next, captured };
}

/** 착수를 적용한 새 상태를 돌려준다. 둘 수 없는 곳이면 같은 state 객체를 그대로 돌려준다(상태 변경 없음). */
export function applyMove(state: GameState, position: Position, player?: Player): GameState {
  const result = tryMove(state, position, player);
  return result.ok ? result.state : state;
}
