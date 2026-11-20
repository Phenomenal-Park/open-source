import type { Player, Position } from "./game/index.ts";
import type { MatchMode, ResultReason } from "./online/protocol.ts";
import { errorText, lang, t } from "./i18n/index.ts";

export interface PublicUser {
  id: string;
  username: string;
  rating: number;
  rank: string;
  provisional: boolean;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  maxRating: number;
  winStreak: number;
  bot: boolean;
}

export interface Session {
  token: string;
  user: PublicUser;
  verified: boolean;
}

export interface Me {
  user: PublicUser;
  verified: boolean;
  activeGame: string | null;
  settings: { allowAi: boolean };
}

export interface RecordSummary {
  id: string;
  mode: MatchMode;
  rated: boolean;
  color: Player;
  opponent: string | null;
  /** 대국 당시 상대 점수 */
  opponentRating: number | null;
  opponentProvisional: boolean;
  result: "win" | "loss" | "draw";
  reason: ResultReason;
  ratingBefore: number | null;
  ratingAfter: number | null;
  moveCount: number;
  finishedAt: string;
  /** 대국 설정: 백 히든 모드였나 */
  hiddenMove?: boolean;
}

export interface GameRecord {
  id: string;
  mode: MatchMode;
  rated: boolean;
  winner: Player | null;
  reason: ResultReason;
  players: Record<Player, { username: string; rating: number | null; provisional: boolean }>;
  ratings: Record<Player, { before: number; after: number }> | null;
  moves: Position[];
  boardSize: number;
  finishedAt: string;
  /** 백 히든 판(따냄 목표 10/10)이었나, 히든 수의 순번 */
  hiddenMove?: boolean;
  hiddenIndex?: number | null;
}

export interface RecordsPage {
  user: PublicUser;
  games: RecordSummary[];
  total: number;
  offset: number;
  favorites: RecordSummary[];
  favoritesMax: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(t("err.noServer"), 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errorText(data?.error, data?.message ?? t("err.noServer")), res.status, data?.error);
  return data as T;
}

type AuthResult = Session & { devCode?: string; mailError?: string };

export const api = {
  signup: (username: string, email: string, password: string, over14: boolean) =>
    call<AuthResult>("/api/signup", { username, email, password, over14, lang }),
  login: (login: string, password: string) => call<AuthResult>("/api/login", { login, password }),
  logout: (token: string) => call<{ ok: true }>("/api/logout", {}, token),
  verify: (token: string, code: string) => call<{ verified: boolean }>("/api/verify", { code }, token),
  resend: (token: string) => call<{ verified: boolean; devCode?: string; mailError?: string }>("/api/verify/resend", { lang }, token),
  me: (token: string) => call<Me>("/api/me", undefined, token),
  settings: (token: string, allowAi: boolean) => call<{ settings: { allowAi: boolean } }>("/api/settings", { allowAi }, token),
  leaderboard: () => call<{ players: PublicUser[] }>("/api/leaderboard"),
  bots: () => call<{ bots: (PublicUser & { level: string; busy: boolean })[] }>("/api/bots"),
  records: (username: string, offset = 0, mode: MatchMode | null = null) =>
    call<RecordsPage>(`/api/records?user=${encodeURIComponent(username)}&offset=${offset}${mode ? `&mode=${mode}` : ""}`),
  myFavorites: (token: string) => call<{ gameIds: string[]; max: number }>("/api/favorites", undefined, token),
  setFavorite: (token: string, gameId: string, on: boolean) => call<{ on: boolean; count: number; max: number }>("/api/favorites", { gameId, on }, token),
  game: (id: string) => call<GameRecord>(`/api/games/${encodeURIComponent(id)}`),
};

/** 로그인 정보(브라우저에만 저장). 저장소를 못 쓰면 이번 화면에서만 유지. */
const KEY = "ddamok.session";
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}
