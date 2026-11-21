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
  /**
   * (실험) 양쪽 히든: 흑도 히든 1번(흑의 세 번째 수부터), 백도 스캔 1번(흑이 숨긴 뒤).
   * 이 설정에서는 "숨긴 뒤 5수면 공개"가 없다. 기본 false
   */
  mutualHidden?: boolean;
  /** (실험) 스캔이 맞으면 상대의 숨은 돌을 걷어 낸다(판에서 없어진다) */
  scanRemoves?: boolean;
  /** (실험) 스캔에 한 수를 쓴다(스캔하면 차례가 넘어간다) */
  scanCostsMove?: boolean;
  /**
   * (실험) 흑 스캔 대신 ⓧ(착수 금지): 흑은 한 판에 한 번, 자기 차례에 빈 교차점 하나를 양쪽 모두 둘 수 없는 자리로 막는다
   * (백 히든 전에도 쓸 수 있고 차례는 그대로). 거기 백의 숨은 돌이 있으면 돌이 드러나고 ⓧ는 남지 않는다.
   * 이 설정에서는 "숨긴 뒤 5수면 공개"가 없다. 기록은 scan(hit = 숨은 돌을 찾음, 아니면 그 자리가 ⓧ)에 남는다.
   */
  blackBlock?: boolean;
  /**
   * (실험, blackBlock과 함께) ⓧ 대신 초록돌: 중립 돌이라 흑·백 모두 따내기 받침으로 쓸 수 있다(초록돌 - 상대 - 상대 - 내 돌).
   * 오목에는 안 들어가고 따이지도 않는다. 놓는 것만으로는 따내지 않는다(놓은 뒤 흑이 이어서 두는 수로 따낼 수 있다).
   */
  greenStone?: boolean;
  /**
   * (실험) 매직스톤 랜덤 출현: 5수마다 천원 중심 9×9 안의 빈 교차점(보이는 판 기준) 하나에 매직스톤이 나타난다.
   * 중립 돌 — 흑·백 모두의 따내기 받침, 오목에 안 들고, 따이지 않고, 아무도 그 자리에 못 둔다.
   * 나타난 자리에 백의 숨은 돌이 있으면 숨은 돌이 드러나고 매직스톤은 남지 않는다.
   */
  randomMagic?: boolean;
  /** (실험) "숨긴 뒤 5수면 공개"를 끈다 */
  noTimedReveal?: boolean;
  /**
   * (실험) 백 지뢰: 백은 한 판에 한 번, 착수 대신 빈 교차점 하나에 지뢰를 묻는다(턴을 씀, 흑에게는 안 보임).
   * 흑이 그 자리에 두면 지뢰가 매직스톤(중립, 양쪽 따내기 받침, 오목에 안 듦)으로 변하고 흑은 그 차례를 잃는다.
   * 백은 자기 지뢰 자리에 둘 수 없다.
   */
  whiteMine?: boolean;
  /** (실험) 지뢰를 밟아도 흑 차례가 그대로다(매직스톤만 생기고 흑은 다른 곳에 다시 둔다) */
  mineKeepsTurn?: boolean;
  /** (실험, 기본 꺼짐) 지뢰룰에서 흑 스캔 1번(맞히면 지뢰가 사라짐). 지뢰 대국은 스캔 없이 가기로 했다 */
  mineScan?: boolean;
  /** (실험) 백이 히든을 쓸 수 있는 가장 이른 때(그때까지 둔 수의 개수). 5 = 백의 세 번째 수. 기본 0(언제든) */
  whiteHiddenFrom?: number;
}

/** 흑 스캔: 백이 히든을 쓴 뒤 한 판에 한 번, 흑 차례에 교차점 하나에 숨은 돌이 있는지 본다(차례는 그대로) */
export interface ScanRecord {
  pos: Position;
  /** 스캔한 때(그때까지 둔 수의 개수) */
  at: number;
  /** 거기 숨은 돌이 있었다(드러남) */
  hit: boolean;
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
  /** 흑 스캔(쓰지 않았으면 null) */
  scan: ScanRecord | null;
  /** (양쪽 히든) 흑이 숨겨 둔 돌 */
  hiddenB?: HiddenStone | null;
  /** (양쪽 히든) 백 스캔 */
  scanW?: ScanRecord | null;
  /** (실험) 랜덤으로 나타난 매직스톤들(at = 그때까지 둔 수, hit = 숨은 돌 자리라 숨은 돌을 드러내고 사라짐) */
  magic?: ScanRecord[];
  /** (실험) 백 지뢰(at = 묻은 때까지 둔 수, 흑이 밟으면 triggered — 그 자리는 magic에 들어간다) */
  mine?: { pos: Position; at: number; triggered: boolean; /** 흑 스캔에 들켜 해체됨(밟힌 것이 아님) */ defused?: boolean } | null;
  /** (AI용) 흑백을 맞바꿔 본 판인가 */
  swapped?: boolean;

  /** 무승부면 null(winReason "draw") */
  winner: Player | null;
  winReason: WinReason | null;
  /** 오목으로 끝났거나 승리 수에 5목이 포함된 경우 그 5개 돌. */
  winningLine: Position[] | null;
  isFinished: boolean;
}

export type IllegalReason = "finished" | "not-your-turn" | "out-of-bounds" | "occupied" | "first-move-center" | "second-move-distance" | "second-move-line" | "hidden-unavailable" | "scan-unavailable";

export type MoveResult =
  | { ok: true; state: GameState; captured: Position[]; /** 흑이 숨은 돌 자리를 눌러 돌이 드러났다(흑 차례 그대로) */ revealedHidden?: boolean }
  | { ok: false; reason: IllegalReason };
