// 온라인 대국 — 브라우저와 Cloudflare Worker가 함께 쓰는 메시지 형식(타입·상수만, 런타임 의존 없음).
import type { Player, Position } from "../game/types.ts";

/** 레이팅매치(무작위·점수 반영) / 친선매치(무작위·미반영) / 친구매치(같은 코드·미반영) */
export type MatchMode = "rated" | "casual" | "friend";
export const MATCH_MODES: readonly MatchMode[] = ["rated", "casual", "friend"];

/** 친구매치 코드: 숫자 1~8자리 */
export const FRIEND_CODE_RE = /^\d{1,8}$/;

/** WebSocket 하위 프로토콜 이름. 브라우저 WebSocket은 헤더를 못 넣으므로 [WS_PROTOCOL, 토큰]으로 인증한다. */
export const WS_PROTOCOL = "ddamok";

/** 접속이 끊긴 뒤 이 시간 안에 돌아오지 않으면 패배 */
export const DISCONNECT_MS = 45_000;

export type ResultReason = "five" | "capture" | "resign" | "disconnect";

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

export interface OnlineResult {
  winner: Player;
  reason: ResultReason;
  ratings?: Record<Player, RatingRow>;
  upset?: boolean;
}

export interface GameSnapshot {
  id: string;
  mode: MatchMode;
  rated: boolean;
  boardSize: number;
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
  | { type: "error"; message: string }
  | { type: "state"; you: Player; game: GameSnapshot };

export type ClientMessage =
  | { type: "move"; row: number; col: number; moveNo: number }
  | { type: "resign" }
  | { type: "ping" };
