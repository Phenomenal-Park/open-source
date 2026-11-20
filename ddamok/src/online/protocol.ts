// 온라인 대국 — 브라우저와 Cloudflare Worker가 함께 쓰는 메시지 형식(타입·상수만, 런타임 의존 없음).
import type { Player, Position } from "../game/types.ts";

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

export type ResultReason = "five" | "capture" | "resign" | "disconnect" | "draw";

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
export const FAVORITES_MAX = 3;

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
}

export type ServerMessage =
  | { type: "waiting" }
  | { type: "matched"; gameId: string }
  | { type: "error"; code: string; message: string }
  | { type: "state"; you: Player; game: GameSnapshot }
  | { type: "pong" };

export type ClientMessage =
  | { type: "move"; row: number; col: number; moveNo: number }
  | { type: "resign" }
  | { type: "ping" };
