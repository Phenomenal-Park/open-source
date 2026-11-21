import type { GameConfig, Player } from "./types.ts";

export const DEFAULT_BOARD_SIZE = 15;
export const MIN_BOARD_SIZE = 5;
export const MAX_BOARD_SIZE = 25;

export const DEFAULT_CAPTURE_TARGET: Readonly<Record<Player, number>> = Object.freeze({
  black: 12,
  white: 10,
});

export function makeConfig(boardSize: number = DEFAULT_BOARD_SIZE, overrides: Partial<Omit<GameConfig, "boardSize">> = {}): GameConfig {
  if (!Number.isInteger(boardSize) || boardSize < MIN_BOARD_SIZE || boardSize > MAX_BOARD_SIZE) {
    throw new RangeError(`boardSize must be an integer between ${MIN_BOARD_SIZE} and ${MAX_BOARD_SIZE}`);
  }
  return {
    boardSize,
    captureTarget: { ...DEFAULT_CAPTURE_TARGET, ...overrides.captureTarget },
    overlineWins: overrides.overlineWins ?? false,
    whiteOverlineWins: overrides.whiteOverlineWins ?? false,
    whiteFirstStoneImmune: overrides.whiteFirstStoneImmune ?? false,
    firstMoveCenter: overrides.firstMoveCenter ?? true,
    secondMoveMinDistance: overrides.secondMoveMinDistance ?? 0,
    secondMoveLineBan: overrides.secondMoveLineBan ?? "none",
    hiddenMove: overrides.hiddenMove ?? false,
    mutualHidden: overrides.mutualHidden ?? false,
    scanRemoves: overrides.scanRemoves ?? false,
    scanCostsMove: overrides.scanCostsMove ?? false,
    blackBlock: overrides.blackBlock ?? false,
    greenStone: overrides.greenStone ?? false,
    randomMagic: overrides.randomMagic ?? false,
    noTimedReveal: overrides.noTimedReveal ?? false,
    whiteHiddenFrom: overrides.whiteHiddenFrom ?? 0,
    whiteMine: overrides.whiteMine ?? false,
  };
}

/** 흑의 두 번째 수에 자리 제한이 있는 규칙인가 */
export function secondMoveRestricted(config: GameConfig): boolean {
  return config.secondMoveMinDistance > 0 || config.secondMoveLineBan !== "none";
}

/** 천원(가운데) 좌표 */
export function centerOf(size: number): { row: number; col: number } {
  const c = Math.floor(size / 2);
  return { row: c, col: c };
}

/** 이 색에게 6목 이상이 승리인가 */
export function overlineWinsFor(config: { overlineWins: boolean; whiteOverlineWins: boolean }, player: Player): boolean {
  return config.overlineWins || (player === "white" && config.whiteOverlineWins);
}

export function opponent(player: Player): Player {
  return player === "black" ? "white" : "black";
}

/** 8방향. 포획은 8방향 각각을 독립적으로 검사한다. */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

/** 오목 판정용 4개 축 (각 축은 양방향으로 센다). */
export const AXES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 0], [1, 1], [1, -1],
];

export function inBounds(size: number, row: number, col: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size;
}
