import type { GameConfig, GameState, Player, Position } from "./types.ts";
import { makeConfig } from "./config.ts";
import { placeMine, scanAt, tryMove, type MoveOptions } from "./rules.ts";

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
    hidden: null,
    scan: null,
    hiddenB: null,
    scanW: null,
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
export function playMove(history: GameHistory, position: Position, player?: Player, opts: MoveOptions = {}): GameHistory {
  const result = tryMove(currentState(history), position, player, opts);
  return result.ok ? [...history, result.state] : history;
}

/** 무르기: 직전 착수 이전 스냅샷으로 되돌린다(따낸 돌·포획 수·차례·승패 모두 복원). */
export function undoMove(history: GameHistory): GameHistory {
  return history.length > 1 ? history.slice(0, -1) : history;
}

export type ReplayResult =
  | { ok: true; state: GameState }
  | { ok: false; moveIndex: number; reason: string };

/** 기보를 처음부터 다시 두어 검증한다(서버의 결과 검증용). 종료 후 수가 더 있으면 실패. hiddenIndex = 백 히든 수의 순번, scan = 흑 스캔(그때까지 둔 수의 개수와 자리) */
export function replayMoves(
  config: GameConfig, moves: readonly Position[], hiddenIndex: number | null = null, scan: { at: number; pos: Position } | null = null,
  /** (지뢰따목) 백 지뢰: 그때까지 둔 수의 개수와 자리. 밟힌 수는 moves에 그대로 있어 다시 두면 같은 일이 일어난다 */
  mine: { at: number; pos: Position } | null = null,
): ReplayResult {
  let state = createGameFromConfig(config);
  const plant = (i: number): string | null => {
    if (!mine || mine.at !== i || state.mine) return null;
    const r = placeMine(state, mine.pos);
    if (!r.ok) return r.reason;
    state = r.state;
    return null;
  };
  for (let i = 0; i < moves.length; i++) {
    const bad = plant(i); // 지뢰는 백 차례에 묻고, 흑 스캔은 그 뒤 흑 차례에 쓴다
    if (bad) return { ok: false, moveIndex: i, reason: bad };
    if (scan && scan.at === i) {
      const s = scanAt(state, scan.pos);
      if (!s.ok) return { ok: false, moveIndex: i, reason: s.reason };
      state = s.state;
    }
    const m = moves[i];
    const result = tryMove(state, { row: m?.row, col: m?.col } as Position, undefined, { hidden: i === hiddenIndex });
    if (!result.ok) return { ok: false, moveIndex: i, reason: result.reason };
    state = result.state;
  }
  const bad = plant(moves.length); // 마지막 수 뒤에 지뢰를 묻었으면
  if (bad) return { ok: false, moveIndex: moves.length, reason: bad };
  // 마지막 수 뒤에 스캔했으면(흑이 스캔하고 아직 두지 않았다)
  if (scan && scan.at === moves.length) {
    const s = scanAt(state, scan.pos);
    if (!s.ok) return { ok: false, moveIndex: moves.length, reason: s.reason };
    state = s.state;
  }
  return { ok: true, state };
}
