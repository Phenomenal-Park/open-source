// 따목 규칙 엔진 — 타입 정의.
// 이 폴더(src/game)는 React·브라우저 API에 의존하지 않는다. 서버(server/)도 같은 코드를 그대로 쓴다.

export type Player = "black" | "white";
export type Cell = Player | null;

export interface Position {
  row: number;
  col: number;
}

/** 대국이 끝난 이유. "draw" = 판이 다 차서 무승부(winner는 null) */
export type WinReason = "five" | "capture" | "draw";

export interface GameConfig {
  /** 바둑판 한 변의 교차점 수. 아직 확정되지 않았으므로 설정값으로 둔다. */
  boardSize: number;
  /** 승리에 필요한 누적 포획 수 (흑 12, 백 10). */
  captureTarget: Record<Player, number>;
  /**
   * 6목 이상(장목)이 승리인지 여부.
   * 지시서 §9-15·§11-4에 따라 기본값은 false(정확히 5목만 승리). 6목 이상 착수 자체는 언제나 허용된다.
   */
  overlineWins: boolean;
  /** 흑의 첫 수는 반드시 천원(가운데). 기본 true — 테스트에서 다른 규칙만 따로 확인할 때만 끈다 */
  firstMoveCenter: boolean;
}

export interface GameState {
  config: GameConfig;
  board: Cell[][];
  currentPlayer: Player;

  capturedByBlack: number;
  capturedByWhite: number;

  moveCount: number;
  lastMove: Position | null;
  /** 방금 둔 수로 제거된 돌(애니메이션·기보용). */
  lastCaptured: Position[];
  /** 지금까지의 착수 좌표 (서버 재검증·기보용). */
  moves: Position[];

  /** 무승부면 null(winReason "draw") */
  winner: Player | null;
  winReason: WinReason | null;
  /** 오목으로 끝났거나 승리 수에 5목이 포함된 경우 그 5개 돌. */
  winningLine: Position[] | null;
  isFinished: boolean;
}

export type IllegalReason = "finished" | "not-your-turn" | "out-of-bounds" | "occupied" | "first-move-center";

export type MoveResult =
  | { ok: true; state: GameState; captured: Position[] }
  | { ok: false; reason: IllegalReason };
