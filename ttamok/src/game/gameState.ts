import type { GameConfig, GameState, Player, Position } from "./types.ts";
import { makeConfig } from "./config.ts";
import { tryMove } from "./rules.ts";

export function createGame(boardSize?: number, options: Partial<Omit<GameConfig, "boardSize">> = {}): GameState {
  const config = makeConfig(boardSize, options);
  return createGameFromConfig(config);
}

export function createGameFromConfig(config: GameConfig): GameState {
  return {
    config,
    board: Array.from({ length: config.boardSize }, () => Array<null>(config.boardSize).fill(null)),
    currentPlayer: "black", // 흑 선착
    capturedByBlack: 0,
    capturedByWhite: 0,
    moveCount: 0,
    lastMove: null,
    lastCaptured: [],
    moves: [],
    winner: null,
    winReason: null,
    winningLine: null,
    isFinished: false,
  };
}

/**
 * 대국 이력: 첫 원소는 초기 상태, 마지막 원소가 현재 상태.
 * 상태는 불변이므로 각 원소가 곧 그 시점의 완전한 스냅샷(돌·포획 수·차례·승패)이다.
 */
export type GameHistory = readonly GameState[];

export function createHistory(initial: GameState): GameHistory {
  return [initial];
}

export function currentState(history: GameHistory): GameState {
  return history[history.length - 1];
}

/** 착수 성공 시 이력에 스냅샷을 추가한다. 실패하면 같은 이력 객체를 돌려준다. */
export function playMove(history: GameHistory, position: Position, player?: Player): GameHistory {
  const result = tryMove(currentState(history), position, player);
  return result.ok ? [...history, result.state] : history;
}

/** 무르기: 직전 착수 이전 스냅샷으로 되돌린다(따낸 돌·포획 수·차례·승패 모두 복원). */
export function undoMove(history: GameHistory): GameHistory {
  return history.length > 1 ? history.slice(0, -1) : history;
}

export type ReplayResult =
  | { ok: true; state: GameState }
  | { ok: false; moveIndex: number; reason: string };

/** 기보를 처음부터 다시 두어 검증한다(서버의 결과 검증용). 종료 후 수가 더 있으면 실패. */
export function replayMoves(config: GameConfig, moves: readonly Position[]): ReplayResult {
  let state = createGameFromConfig(config);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const result = tryMove(state, { row: m?.row, col: m?.col } as Position);
    if (!result.ok) return { ok: false, moveIndex: i, reason: result.reason };
    state = result.state;
  }
  return { ok: true, state };
}
