// 온라인 대국 — 브라우저와 Cloudflare Worker가 함께 쓰는 메시지 형식(타입·상수만, 런타임 의존 없음).
import type { GameState, Player, Position } from "../game/types.ts";

/** 레이팅매치(무작위·점수 반영) / 친선매치(무작위·미반영) / 친구매치(같은 코드·미반영) */
export type MatchMode = "rated" | "casual" | "friend";
export const MATCH_MODES: readonly MatchMode[] = ["rated", "casual", "friend"];

/** 친구매치 코드: 숫자 1~8자리 */
export const FRIEND_CODE_RE = /^\d{1,8}$/;

/** WebSocket 하위 프로토콜 이름. 브라우저 WebSocket은 헤더를 못 넣으므로 [WS_PROTOCOL, 토큰]으로 인증한다. */
export const WS_PROTOCOL = "ddamok";

/** 접속이 끊긴 것을 서버가 알아챈 뒤 이 시간 안에 돌아오지 않으면 패배 */
export const DISCONNECT_MS = 45_000;

/**
 * 신호 확인(하트비트): 브라우저는 HEARTBEAT_MS마다 PING을 보낸다(서버는 깨어나지 않고 자동으로 PONG).
 * 서버는 HEARTBEAT_TIMEOUT_MS 동안 아무 신호가 없으면 "조용히 끊긴" 것으로 보고 그때부터 DISCONNECT_MS를 센다.
 */
export const HEARTBEAT_MS = 10_000;
export const HEARTBEAT_TIMEOUT_MS = 25_000;
export const PING = '{"type":"ping"}';
export const PONG = '{"type":"pong"}';

/** 백 히든: 버튼을 누른 뒤 둘 때까지의 시간(서버는 통신 지연을 감안해 HIDDEN_GRACE_MS를 더 기다린다) */
export const HIDDEN_MS = 10_000;
export const HIDDEN_GRACE_MS = 1_500;

/** 온라인 대국 규칙: 백 히든이 있는 판은 흑·백 모두 10개 따내면 승리 */
export const HIDDEN_CAPTURE_TARGET = { black: 10, white: 10 } as const;

export type ResultReason = "five" | "capture" | "resign" | "disconnect" | "timeout" | "draw";

/** 대국 시계(피셔 방식): 처음 시간 + 한 수 둘 때마다 1초 추가. 레이팅·친선은 3분, 친구매치는 1·3·5·10분 중 선택 */
export const CLOCK_INCREMENT_MS = 1_000;
export const DEFAULT_CLOCK_MIN = 3;
export const FRIEND_CLOCK_MINUTES = [1, 3, 5, 10] as const;
export type ClockMinutes = (typeof FRIEND_CLOCK_MINUTES)[number];

export interface ClockView {
  /** 처음 시간(ms)·한 수마다 더하는 시간(ms) */
  baseMs: number;
  incMs: number;
  /** 남은 시간(ms) — 서버가 이 상태를 보낸 순간 기준 */
  remaining: Record<Player, number>;
  /** 지금 줄어드는 쪽(멈춰 있으면 null — 시작 전·히든 고르는 중·끝남) */
  running: Player | null;
}

export interface PlayerInfo {
  username: string;
  rank: string;
  rating: number;
  /** 점수 확정 전(점수 뒤에 ?) */
  provisional: boolean;
  bot: boolean;
}

export interface RatingRow {
  before: number;
  after: number;
  bonus: number;
  rank: string;
  provisional: boolean;
}

/** 점수 표시: 확정 전이면 뒤에 ? */
export function formatRating(rating: number, provisional: boolean): string {
  return provisional ? `${rating}?` : String(rating);
}

/** 명승부(박제) 한도 */
export const FAVORITES_MAX = 1;

export interface OnlineResult {
  /** 무승부면 null */
  winner: Player | null;
  reason: ResultReason;
  ratings?: Record<Player, RatingRow>;
  upset?: boolean;
}

export interface GameSnapshot {
  id: string;
  mode: MatchMode;
  rated: boolean;
  boardSize: number;
  /** (실험용) 흑 두 번째 수 제한 칸 수(0 = 없음) — 대국 시작 때 정해져 끝까지 유지 */
  secondMoveMinDistance?: number;
  players: Record<Player, PlayerInfo>;
  moves: Position[];
  status: "playing" | "finished" | "aborted";
  result: OnlineResult | null;
  /** 접속이 끊긴 쪽과 패배까지 남은 시간(ms) */
  disconnected: Partial<Record<Player, number>>;
  /** 백 히든 규칙이 켜진 판 */
  hiddenMove?: boolean;
  /**
   * 이 화면을 보는 사람에게 보이는 판(서버가 계산). 백 히든이 있는 판에서는 흑에게 숨은 돌이 빈칸으로,
   * moves의 그 수도 (-1, -1)로 온다. 있으면 클라이언트는 기보를 다시 두지 않고 이 판을 그대로 그린다.
   */
  view?: GameState;
  /** 백이 히든을 눌렀고 아직 두지 않았다: 남은 시간(ms) */
  hiddenArmedMs?: number;
  /** 대국 시계 */
  clock?: ClockView;
}

export type ServerMessage =
  | { type: "waiting" }
  | { type: "matched"; gameId: string }
  | { type: "error"; code: string; message: string }
  | { type: "state"; you: Player; game: GameSnapshot }
  | { type: "pong" };

export type ClientMessage =
  | { type: "move"; row: number; col: number; moveNo: number; /** 백 히든으로 숨겨 둔다 */ hidden?: boolean }
  /** 백이 히든을 누름(10초 안에 hidden:true로 둬야 한다) */
  | { type: "hidden" }
  /** 흑 스캔: 교차점 하나에 숨은 돌이 있는지 본다(한 판에 한 번, 차례 그대로) */
  | { type: "scan"; row: number; col: number; moveNo: number }
  | { type: "resign" }
  | { type: "ping" };

/**
 * 친선·친구매치의 규칙 선택. "hidden" = 히든룰(백 히든 1번 + 흑 스캔 1번, 따냄 10/10),
 * "nohidden" = 노히든룰(히든·스캔 없음, 흑 12 / 백 10), "any" = 아무 규칙이나. 레이팅매치는 늘 히든룰.
 */
export type MatchRule = "any" | "hidden" | "nohidden";
export const MATCH_RULES: readonly MatchRule[] = ["any", "hidden", "nohidden"];

/** 두 사람의 규칙 선택이 맞으면 그 판의 규칙(히든이면 true), 안 맞으면 null. 둘 다 "아무거나"면 히든룰 */
export function agreedRule(a: MatchRule, b: MatchRule): boolean | null {
  if (a !== "any" && b !== "any" && a !== b) return null;
  return a !== "nohidden" && b !== "nohidden";
}
