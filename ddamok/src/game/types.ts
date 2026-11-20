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
  /** (실험용, 기본 false) 백만 6목 이상도 승리 — 흑은 overlineWins를 따른다 */
  whiteOverlineWins: boolean;
  /** (실험용, 기본 false) 백의 첫 돌(전체 2수째)은 절대 따이지 않는다 — 그 돌이 낀 두 돌은 둘 다 무사 */
  whiteFirstStoneImmune: boolean;
  /** 흑의 첫 수는 반드시 천원(가운데). 기본 true — 테스트에서 다른 규칙만 따로 확인할 때만 끈다 */
  firstMoveCenter: boolean;
  /**
   * 흑의 두 번째 수(전체 3수째)는 천원에서 가로·세로 어느 쪽으로든 이 칸 수 이상 떨어져야 한다(펜테식 제한).
   * 0 = 제한 없음(기본). 흑백 밸런스 실험용.
   */
  secondMoveMinDistance: number;
  /**
   * (실험용) 흑의 두 번째 수(전체 3수째)는 천원을 지나는 줄(판 전체)에 둘 수 없다.
   * "cross" = 가로줄·세로줄, "star" = 가로·세로 + 두 대각선. 기본 "none"
   */
  secondMoveLineBan: "none" | "cross" | "star";
  /** 백 히든: 백은 한 판에 한 번, 돌을 숨겨서 둘 수 있다(같은 화면 2인 대국에서는 끈다). 기본 false */
  hiddenMove: boolean;
  /** (시험) 백 히든 돌을 따내면 몇 개로 치는가. 기본 1 */
  hiddenCaptureValue: number;
}

/** 백이 숨겨 둔 돌 */
export interface HiddenStone {
  /** moves에서 몇 번째 수인가 */
  index: number;
  pos: Position;
  /** 흑도 볼 수 있게 드러났는가(흑이 그 자리를 눌렀을 때, 그 돌로 따냈을 때, 따였을 때, 대국이 끝났을 때) */
  revealed: boolean;
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
  /** 백 히든 돌(쓰지 않았으면 null) */
  hidden: HiddenStone | null;

  /** 무승부면 null(winReason "draw") */
  winner: Player | null;
  winReason: WinReason | null;
  /** 오목으로 끝났거나 승리 수에 5목이 포함된 경우 그 5개 돌. */
  winningLine: Position[] | null;
  isFinished: boolean;
}

export type IllegalReason = "finished" | "not-your-turn" | "out-of-bounds" | "occupied" | "first-move-center" | "second-move-distance" | "second-move-line" | "hidden-unavailable";

export type MoveResult =
  | { ok: true; state: GameState; captured: Position[]; /** 흑이 숨은 돌 자리를 눌러 돌이 드러났다(흑 차례 그대로) */ revealedHidden?: boolean }
  | { ok: false; reason: IllegalReason };
