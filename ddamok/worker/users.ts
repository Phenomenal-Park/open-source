import { rankFor } from "../src/rating/ranks.ts";
import { isProvisional, type RatedPlayer } from "../src/rating/elo.ts";
import { hashToken, TOKEN_RE } from "./auth.ts";

export interface UserRow {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  email: string | null;
  email_verified: number;
  rating: number;
  mmr: number;
  rd: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  max_rating: number;
  win_streak: number;
  active_game: string | null;
  allow_ai: number;
  is_bot: number;
  bot_level: string | null;
  created_at: string;
}

export function publicUser(u: UserRow) {
  return {
    id: u.id, username: u.username, rating: u.rating, rank: rankFor(u.rating).label, provisional: isProvisional(u),
    games: u.games, wins: u.wins, losses: u.losses, draws: u.draws, maxRating: u.max_rating, winStreak: u.win_streak, bot: !!u.is_bot,
  };
}

export const toRated = (u: UserRow): RatedPlayer => ({ rating: u.rating, mmr: u.mmr, rd: u.rd, games: u.games, winStreak: u.win_streak });

export async function userByToken(db: D1Database, token: string | null | undefined, now = Date.now()): Promise<UserRow | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  return db
    .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(await hashToken(token), now)
    .first<UserRow>();
}
