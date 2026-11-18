import type { Player, Position, WinReason } from "./game/index.ts";

export interface PublicUser {
  id: string;
  username: string;
  rating: number;
  rank: string;
  games: number;
  wins: number;
  losses: number;
  winStreak: number;
}

export interface Session {
  token: string;
  user: PublicUser;
}

export interface SideResult {
  user: PublicUser;
  before: number;
  after: number;
  bonus: number;
}

export interface RatedResult {
  winner: Player;
  winReason: WinReason;
  upset: boolean;
  black: SideResult;
  white: SideResult;
}

export class ApiError extends Error {}

async function call<T>(path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("서버에 연결할 수 없습니다.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message ?? "서버에 연결할 수 없습니다.");
  return data as T;
}

export const api = {
  signup: (username: string, password: string) => call<Session>("/api/signup", { username, password }),
  login: (username: string, password: string) => call<Session>("/api/login", { username, password }),
  logout: (token: string) => call<{ ok: true }>("/api/logout", {}, token),
  me: (token: string) => call<{ user: PublicUser }>("/api/me", undefined, token),
  leaderboard: () => call<{ players: PublicUser[] }>("/api/leaderboard"),
  startRated: (blackToken: string, whiteToken: string) =>
    call<{ gameId: string; boardSize: number }>("/api/rated-games", { blackToken, whiteToken }),
  submitRated: (gameId: string, moves: Position[], token: string) =>
    call<RatedResult>(`/api/rated-games/${encodeURIComponent(gameId)}/result`, { moves }, token),
};
