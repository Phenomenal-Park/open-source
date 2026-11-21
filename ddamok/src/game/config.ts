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
    scanWall: overrides.scanWall ?? false,
    blackBlock: overrides.blackBlock ?? false,
    greenStone: overrides.greenStone ?? false,
    randomMagic: overrides.randomMagic ?? false,
    noTimedReveal: overrides.noTimedReveal ?? false,
    whiteHiddenFrom: overrides.whiteHiddenFrom ?? 0,
    whiteMine: overrides.whiteMine ?? false,
    mineScan: overrides.mineScan ?? false,
    mineKeepsTurn: overrides.mineKeepsTurn ?? false,
  };
}

/**
 * 대국 규칙(이름은 "○○따목").
 * - plain(따목): 히든·스캔 없음, 흑 12 / 백 10
 * - hidden(히든따목): 백 히든 1번(아무 때나, 저절로 공개 안 됨) + 흑 스캔 1번(맞히면 숨은 돌 발각·소멸), 8/8
 * - mine(지뢰따목): 백 지뢰 1번(착수 대신) + 흑 스캔 1번(찾으면 매직스톤, 흑 차례 유지), 밟으면 매직스톤·흑 차례 잃음, 8/8
 * - hidden13: 예전 히든룰 v1.3(5수 공개, 스캔에 맞아도 돌이 남음, 10/10) — 옛 기보를 다시 둘 때만
 */
export type GameRule = "plain" | "hidden" | "mine" | "hidden13";
export const GAME_RULES: readonly GameRule[] = ["plain", "hidden", "mine"];

export function ruleConfig(rule: GameRule): Partial<Omit<GameConfig, "boardSize">> {
  switch (rule) {
    case "hidden": return { hiddenMove: true, noTimedReveal: true, scanRemoves: true, captureTarget: { black: 8, white: 8 } };
    case "mine": return { whiteMine: true, mineScan: true, captureTarget: { black: 8, white: 8 } };
    case "hidden13": return { hiddenMove: true, captureTarget: { black: 10, white: 10 } };
    default: return {};
  }
}

/** 이 설정이 어느 규칙인가(기록·표시용) */
export function ruleOf(config: GameConfig): GameRule {
  if (config.whiteMine) return "mine";
  if (config.hiddenMove) return config.scanRemoves ? "hidden" : "hidden13";
  return "plain";
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
