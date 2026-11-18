// 따목 API 서버: 계정(아이디·비밀번호), 랭크 대국 결과 검증, 점수·순위.
// 규칙 판정은 src/game 엔진을 그대로 재사용한다(클라이언트가 보낸 승패를 믿지 않고 기보를 다시 둬서 확인).
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { makeConfig, DEFAULT_BOARD_SIZE } from "../src/game/config.ts";
import { replayMoves } from "../src/game/gameState.ts";
import type { Position } from "../src/game/types.ts";
import {
  calibrationFactor, INITIAL_RATING, MMR_START, rateGame, rescale, TOP_MMR, type RatedPlayer,
} from "../src/rating/elo.ts";
import { RANKS, rankFor } from "../src/rating/ranks.ts";
import {
  hashPassword, hashToken, newToken, PASSWORD_MAX, PASSWORD_MIN, RateLimiter, SESSION_TTL_MS, USERNAME_RE, verifyPassword,
} from "./auth.ts";
import { Store, type UserRecord } from "./store.ts";

/** 랭크 대국 판 크기(판 크기가 확정되면 바꾼다). 크기가 다른 판끼리 점수를 섞지 않기 위해 하나로 고정. */
export const RATED_BOARD_SIZE = DEFAULT_BOARD_SIZE;
const RATED_GAME_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;

export interface AppOptions {
  dataDir: string;
  staticDir?: string;
  now?: () => number;
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function publicUser(u: UserRecord) {
  const rank = rankFor(u.rating);
  return {
    id: u.id, username: u.username, rating: u.rating, rank: rank.label,
    games: u.games, wins: u.wins, losses: u.losses, winStreak: u.winStreak,
  };
}

const toRated = (u: UserRecord): RatedPlayer => ({ rating: u.rating, mmr: u.mmr, games: u.games, winStreak: u.winStreak });

export function createApp(opts: AppOptions) {
  const store = new Store(opts.dataDir);
  const now = opts.now ?? Date.now;
  const authLimiter = new RateLimiter(10, 60_000);      // 로그인·가입: IP당 분당 10회
  const signupLimiter = new RateLimiter(20, 3_600_000); // 가입: IP당 시간당 20회
  const writeLimiter = new RateLimiter(60, 60_000);     // 그 밖의 쓰기: IP당 분당 60회

  function ipOf(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? "unknown";
  }

  function userFromToken(token: unknown): UserRecord {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) throw new HttpError(401, "unauthorized", "로그인이 필요합니다.");
    const h = hashToken(token);
    const s = store.db.sessions.find((x) => x.tokenHash === h && x.expiresAt > now());
    const u = s && store.userById(s.userId);
    if (!u) throw new HttpError(401, "unauthorized", "로그인이 만료되었습니다.");
    return u;
  }

  function bearer(req: IncomingMessage): string | undefined {
    const h = req.headers.authorization;
    return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
  }

  function issueSession(u: UserRecord) {
    const token = newToken();
    const t = now();
    store.db.sessions = store.db.sessions.filter((s) => s.expiresAt > t);
    store.db.sessions.push({ tokenHash: hashToken(token), userId: u.id, expiresAt: t + SESSION_TTL_MS });
    return { token, user: publicUser(u) };
  }

  function credentials(body: Record<string, unknown>) {
    const username = typeof body.username === "string" ? body.username.normalize("NFC").trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    return { username, password };
  }

  /** 정기 보정(시작 시 + 하루 1회): 9단 비율이 0.05~0.1%를 벗어나면 폭을 조금 되돌린다. */
  function calibrate(): number | null {
    const players = store.db.users.filter((u) => u.games > 0);
    const factor = calibrationFactor(players.map((u) => u.mmr));
    if (factor === null) return null;
    for (const u of players) Object.assign(u, rescale(toRated(u), factor));
    store.db.calibrations.push({ at: new Date(now()).toISOString(), factor, players: players.length });
    store.save();
    return factor;
  }

  function stats() {
    const players = store.db.users.filter((u) => u.games > 0);
    const dist = RANKS.map((r) => ({ rank: r.label, players: 0 }));
    for (const u of players) dist[rankFor(u.rating).index].players++;
    const sorted = players.map((u) => u.rating).sort((a, b) => a - b);
    return {
      users: store.db.users.length,
      players: players.length,
      medianRating: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      topRankShare: players.length ? players.filter((u) => u.rating >= TOP_MMR).length / players.length : 0,
      distribution: dist,
      lastCalibration: store.db.calibrations.at(-1) ?? null,
    };
  }

  const routes: Record<string, (req: IncomingMessage, body: Record<string, unknown>, params: string[]) => Promise<unknown> | unknown> = {
    "POST /api/signup": async (req, body) => {
      if (!authLimiter.allow(ipOf(req)) || !signupLimiter.allow(ipOf(req))) throw new HttpError(429, "rate_limited", "잠시 후 다시 시도해 주세요.");
      const { username, password } = credentials(body);
      if (!USERNAME_RE.test(username)) throw new HttpError(400, "bad_username", "아이디는 한글·영문·숫자·_ 2~16자입니다.");
      if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new HttpError(400, "bad_password", `비밀번호는 ${PASSWORD_MIN}자 이상입니다.`);
      if (store.userByName(username)) throw new HttpError(409, "taken", "이미 있는 아이디입니다.");
      const u: UserRecord = {
        id: randomUUID(), username, usernameKey: username.toLowerCase(), passwordHash: await hashPassword(password),
        rating: INITIAL_RATING, mmr: MMR_START, games: 0, wins: 0, losses: 0, winStreak: 0, createdAt: new Date(now()).toISOString(),
      };
      // scrypt를 기다리는 동안 같은 아이디가 생겼을 수 있다
      if (store.userByName(username)) throw new HttpError(409, "taken", "이미 있는 아이디입니다.");
      store.db.users.push(u);
      const out = issueSession(u);
      store.save();
      return out;
    },

    "POST /api/login": async (req, body) => {
      if (!authLimiter.allow(ipOf(req))) throw new HttpError(429, "rate_limited", "잠시 후 다시 시도해 주세요.");
      const { username, password } = credentials(body);
      const u = store.userByName(username);
      const ok = u ? await verifyPassword(password, u.passwordHash) : (await hashPassword(password), false);
      if (!u || !ok) throw new HttpError(401, "bad_credentials", "아이디 또는 비밀번호가 맞지 않습니다.");
      const out = issueSession(u);
      store.save();
      return out;
    },

    "POST /api/logout": (req) => {
      const t = bearer(req);
      if (t) {
        const h = hashToken(t);
        store.db.sessions = store.db.sessions.filter((s) => s.tokenHash !== h);
        store.save();
      }
      return { ok: true };
    },

    "GET /api/me": (req) => ({ user: publicUser(userFromToken(bearer(req))) }),

    "GET /api/leaderboard": () => ({
      players: store.db.users
        .filter((u) => u.games > 0)
        .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
        .slice(0, 50)
        .map(publicUser),
    }),

    "GET /api/stats": () => stats(),

    /** 같은 화면에서 두 사람이 각각 로그인한 뒤 랭크 대국을 연다. 두 사람의 토큰이 모두 필요하다. */
    "POST /api/rated-games": (req, body) => {
      if (!writeLimiter.allow(ipOf(req))) throw new HttpError(429, "rate_limited", "잠시 후 다시 시도해 주세요.");
      const black = userFromToken(body.blackToken);
      const white = userFromToken(body.whiteToken);
      if (black.id === white.id) throw new HttpError(400, "same_user", "같은 계정끼리는 랭크 대국을 둘 수 없습니다.");
      const t = now();
      store.db.games = store.db.games.filter((g) => g.status === "finished" || t - Date.parse(g.createdAt) < RATED_GAME_TTL_MS);
      const game = {
        id: randomUUID(), blackId: black.id, whiteId: white.id, boardSize: RATED_BOARD_SIZE,
        status: "playing" as const, createdAt: new Date(t).toISOString(),
      };
      store.db.games.push(game);
      store.save();
      return { gameId: game.id, boardSize: game.boardSize, black: publicUser(black), white: publicUser(white) };
    },

    /** 대국 종료 후 기보 제출 → 서버가 처음부터 다시 둬서 승패를 확인하고 점수를 반영한다(한 번만). */
    "POST /api/rated-games/:id/result": (req, body, [id]) => {
      if (!writeLimiter.allow(ipOf(req))) throw new HttpError(429, "rate_limited", "잠시 후 다시 시도해 주세요.");
      const submitter = userFromToken(bearer(req));
      const game = store.db.games.find((g) => g.id === id);
      if (!game) throw new HttpError(404, "not_found", "대국을 찾을 수 없습니다.");
      if (submitter.id !== game.blackId && submitter.id !== game.whiteId) throw new HttpError(403, "forbidden", "대국 참가자가 아닙니다.");
      if (game.status === "finished") throw new HttpError(409, "already_finished", "이미 결과가 반영된 대국입니다.");
      if (now() - Date.parse(game.createdAt) > RATED_GAME_TTL_MS) throw new HttpError(410, "expired", "대국 시간이 지났습니다.");

      const moves = body.moves;
      if (!Array.isArray(moves) || moves.length > game.boardSize * game.boardSize * 4) throw new HttpError(400, "bad_moves", "기보 형식이 잘못되었습니다.");
      const clean: Position[] = moves.map((m) => ({ row: (m as Position)?.row, col: (m as Position)?.col }));
      const replay = replayMoves(makeConfig(game.boardSize), clean);
      if (!replay.ok) throw new HttpError(400, "illegal_move", `${replay.moveIndex + 1}번째 수가 규칙에 맞지 않습니다.`);
      const final = replay.state;
      if (!final.isFinished || !final.winner) throw new HttpError(400, "not_finished", "아직 끝나지 않은 대국입니다.");

      const black = store.userById(game.blackId)!;
      const white = store.userById(game.whiteId)!;
      const [w, l] = final.winner === "black" ? [black, white] : [white, black];
      const change = rateGame(toRated(w), toRated(l));
      Object.assign(w, change.winner.after, { wins: w.wins + 1 });
      Object.assign(l, change.loser.after, { losses: l.losses + 1 });

      Object.assign(game, {
        status: "finished", finishedAt: new Date(now()).toISOString(), moves: clean,
        winnerId: w.id, winReason: final.winReason, upset: change.upset,
        ratingChanges: {
          [w.id]: { before: change.winner.before.rating, after: change.winner.after.rating, bonus: change.winner.bonus },
          [l.id]: { before: change.loser.before.rating, after: change.loser.after.rating, bonus: 0 },
        },
      });
      store.save();
      return {
        winner: final.winner, winReason: final.winReason, upset: change.upset,
        black: { user: publicUser(black), ...game.ratingChanges![black.id] },
        white: { user: publicUser(white), ...game.ratingChanges![white.id] },
      };
    },
  };

  async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (req.method === "GET") return {};
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) throw new HttpError(413, "too_large", "요청이 너무 큽니다.");
      chunks.push(chunk as Buffer);
    }
    if (!chunks.length) return {};
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      throw new HttpError(400, "bad_json", "JSON 형식이 잘못되었습니다.");
    }
  }

  function match(method: string, path: string) {
    for (const key of Object.keys(routes)) {
      const [m, pattern] = key.split(" ");
      if (m !== method) continue;
      const a = pattern.split("/"), b = path.split("/");
      if (a.length !== b.length) continue;
      const params: string[] = [];
      if (a.every((seg, i) => (seg.startsWith(":") ? (params.push(decodeURIComponent(b[i])), true) : seg === b[i]))) {
        return { handler: routes[key], params };
      }
    }
    return null;
  }

  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
  };

  function serveStatic(path: string, res: ServerResponse): boolean {
    if (!opts.staticDir || !existsSync(opts.staticDir)) return false;
    const root = resolve(opts.staticDir);
    let file = resolve(join(root, normalize(decodeURIComponent(path))));
    if (file !== root && !file.startsWith(root + sep)) return false;
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html"); // SPA
    if (!existsSync(file)) return false;
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
    return true;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("x-content-type-options", "nosniff");
    try {
      if (url.pathname.startsWith("/api/")) {
        const route = match(req.method ?? "GET", url.pathname);
        if (!route) throw new HttpError(404, "not_found", "없는 주소입니다.");
        const body = await readBody(req);
        const out = await route.handler(req, body, route.params);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(out));
        return;
      }
      if (req.method === "GET" && serveStatic(url.pathname, res)) return;
      res.writeHead(404).end("not found");
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(500, "internal", "서버 오류");
      if (!(e instanceof HttpError)) console.error(e);
      res.writeHead(err.status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: err.code, message: err.message }));
    }
  }

  return { handle, store, calibrate, stats };
}
