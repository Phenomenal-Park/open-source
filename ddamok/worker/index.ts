// 따목 Cloudflare Worker: 계정 API(D1) + 온라인 매칭·대국(Durable Objects, WebSocket). 화면(dist)은 정적 파일.
import { calibrationFactor, rescale, TOP_MMR } from "../src/rating/elo.ts";
import { RANKS, rankFor } from "../src/rating/ranks.ts";
import { FRIEND_CODE_RE, MATCH_MODES, WS_PROTOCOL, type MatchMode } from "../src/online/protocol.ts";
import { hashPassword, hashToken, newToken, PASSWORD_MAX, PASSWORD_MIN, SESSION_TTL_MS, USERNAME_RE, verifyPassword } from "./auth.ts";
import { publicUser, toRated, userByToken, type UserRow } from "./users.ts";
import { mailLang, sendVerificationCode, type MailLang } from "./mail.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 6자리 인증 코드를 만들어(해시만 저장) 메일로 보낸다. 10분 유효. */
async function issueEmailCode(env: Env, u: UserRow, lang: MailLang): Promise<{ devCode?: string; mailError?: string }> {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = String(n).padStart(6, "0");
  await env.DB.prepare("INSERT OR REPLACE INTO email_codes (user_id, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)")
    .bind(u.id, await hashToken(`${u.id}:${code}`), Date.now() + 10 * 60_000).run();
  try {
    return await sendVerificationCode(env, u.email!, code, lang);
  } catch (e) {
    console.error("mail", e);
    return { mailError: "mail" }; // 오류 코드(화면이 언어에 맞게 보여 준다)
  }
}

export { Matchmaker } from "./matchmaker.ts";
export { GameRoom } from "./room.ts";

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function limited(limiter: RateLimit | undefined, req: Request) {
  if (!limiter) return;
  const { success } = await limiter.limit({ key: req.headers.get("cf-connecting-ip") ?? "local" });
  if (!success) throw new HttpError(429, "rate_limited", "잠시 후 다시 시도해 주세요.");
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 16_384) throw new HttpError(413, "too_large", "요청이 너무 큽니다.");
  try {
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    throw new HttpError(400, "bad_json", "JSON 형식이 잘못되었습니다.");
  }
}

function credentials(body: Record<string, unknown>) {
  const username = typeof body.username === "string" ? body.username.normalize("NFC").trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  return { username, password };
}

async function issueSession(env: Env, u: UserRow) {
  const token = newToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(u.id, now),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await hashToken(token), u.id, now + SESSION_TTL_MS),
  ]);
  return { token, user: publicUser(u) };
}

const bearer = (req: Request) => {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
};

/** WebSocket 인증: Sec-WebSocket-Protocol: ddamok, <토큰> */
function wsToken(req: Request): string | null {
  const parts = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim());
  return parts[0] === WS_PROTOCOL && parts[1] ? parts[1] : null;
}

async function requireUser(env: Env, token: string | null): Promise<UserRow> {
  const u = await userByToken(env.DB, token);
  if (!u) throw new HttpError(401, "unauthorized", "로그인이 필요합니다.");
  return u;
}

function forwardWs(stub: { fetch(r: Request): Promise<Response> }, url: string, u: UserRow) {
  return stub.fetch(new Request(url, { headers: { upgrade: "websocket", "x-user-id": u.id, "x-username": u.username } }));
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  const m = req.method;

  // 가입: 닉네임 · 이메일 · 비밀번호 (+ 만 14세 이상 확인) → 인증 코드 메일 발송
  if (m === "POST" && path === "/api/signup") {
    await limited(env.AUTH_LIMITER, req);
    await limited(env.SIGNUP_LIMITER, req);
    const body = await readJson(req);
    const { username, password } = credentials(body);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!USERNAME_RE.test(username)) throw new HttpError(400, "bad_username", "닉네임은 한글·영문·숫자·_(일본어 가능) 2~16자입니다.");
    if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, "bad_email", "이메일 주소를 확인해 주세요.");
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new HttpError(400, "bad_password", `비밀번호는 ${PASSWORD_MIN}자 이상입니다.`);
    if (body.over14 !== true) throw new HttpError(400, "age", "만 14세 이상만 가입할 수 있습니다.");
    const key = username.toLowerCase();
    if (await env.DB.prepare("SELECT 1 FROM users WHERE username_key = ?").bind(key).first()) throw new HttpError(409, "taken", "이미 있는 닉네임입니다.");
    if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) throw new HttpError(409, "email_taken", "이미 가입된 이메일입니다.");
    const u = {
      id: crypto.randomUUID(), username, username_key: key, email, password_hash: await hashPassword(password, Number(env.PBKDF2_ITERATIONS) || 100_000),
      created_at: new Date().toISOString(),
    };
    try {
      await env.DB.prepare("INSERT INTO users (id, username, username_key, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(u.id, u.username, u.username_key, u.email, u.password_hash, u.created_at).run();
    } catch {
      throw new HttpError(409, "taken", "이미 있는 닉네임 또는 이메일입니다."); // 동시 가입(UNIQUE)
    }
    const row = (await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(u.id).first<UserRow>())!;
    const session = await issueSession(env, row);
    const sent = await issueEmailCode(env, row, mailLang(body.lang));
    return json({ ...session, verified: false, ...sent });
  }

  // 로그인: 이메일 또는 닉네임 + 비밀번호
  if (m === "POST" && path === "/api/login") {
    await limited(env.AUTH_LIMITER, req);
    const body = await readJson(req);
    const login = typeof body.login === "string" ? body.login.normalize("NFC").trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const u = await env.DB.prepare("SELECT * FROM users WHERE is_bot = 0 AND (username_key = ?1 OR email = ?1)").bind(login).first<UserRow>();
    if (!u || !(await verifyPassword(password, u.password_hash))) throw new HttpError(401, "bad_credentials", "이메일(닉네임) 또는 비밀번호가 맞지 않습니다.");
    return json({ ...(await issueSession(env, u)), verified: !!u.email_verified });
  }

  // 이메일 인증 코드 확인
  if (m === "POST" && path === "/api/verify") {
    await limited(env.AUTH_LIMITER, req);
    const u = await requireUser(env, bearer(req));
    if (u.email_verified) return json({ verified: true });
    const code = String((await readJson(req)).code ?? "").trim();
    const rec = await env.DB.prepare("SELECT * FROM email_codes WHERE user_id = ?").bind(u.id).first<{ code_hash: string; expires_at: number; attempts: number }>();
    if (!rec || rec.expires_at < Date.now()) throw new HttpError(400, "expired", "코드가 만료되었습니다. 다시 받아 주세요.");
    if (rec.attempts >= 5) throw new HttpError(400, "too_many", "시도 횟수를 넘었습니다. 코드를 다시 받아 주세요.");
    if (!/^\d{6}$/.test(code) || (await hashToken(`${u.id}:${code}`)) !== rec.code_hash) {
      await env.DB.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?").bind(u.id).run();
      throw new HttpError(400, "wrong_code", "코드가 맞지 않습니다.");
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(u.id),
      env.DB.prepare("DELETE FROM email_codes WHERE user_id = ?").bind(u.id),
    ]);
    return json({ verified: true });
  }

  if (m === "POST" && path === "/api/verify/resend") {
    await limited(env.SIGNUP_LIMITER, req);
    const u = await requireUser(env, bearer(req));
    if (u.email_verified) return json({ verified: true });
    return json({ verified: false, ...(await issueEmailCode(env, u, mailLang((await readJson(req)).lang))) });
  }

  if (m === "POST" && path === "/api/logout") {
    const t = bearer(req);
    if (t) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(t)).run();
    return json({ ok: true });
  }

  if (m === "GET" && path === "/api/me") {
    const u = await requireUser(env, bearer(req));
    return json({ user: publicUser(u), verified: !!u.email_verified, activeGame: u.active_game, settings: { allowAi: !!u.allow_ai } });
  }

  if (m === "POST" && path === "/api/settings") {
    const u = await requireUser(env, bearer(req));
    const body = await readJson(req);
    if (typeof body.allowAi !== "boolean") throw new HttpError(400, "bad_settings", "설정 값이 잘못되었습니다.");
    await env.DB.prepare("UPDATE users SET allow_ai = ? WHERE id = ?").bind(body.allowAi ? 1 : 0, u.id).run();
    return json({ settings: { allowAi: body.allowAi } });
  }

  if (m === "GET" && path === "/api/leaderboard") {
    const rows = await env.DB.prepare("SELECT * FROM users WHERE games > 0 AND is_bot = 0 ORDER BY rating DESC, wins DESC LIMIT 50").all<UserRow>();
    return json({ players: rows.results.map(publicUser) });
  }

  // AI 계정 목록(현재 점수·급수 — 사람과의 레이팅매치로 바뀐다)
  if (m === "GET" && path === "/api/bots") {
    const rows = await env.DB.prepare("SELECT * FROM users WHERE is_bot = 1 ORDER BY mmr").all<UserRow>();
    return json({ bots: rows.results.map((u) => ({ ...publicUser(u), level: u.bot_level, busy: !!u.active_game })) });
  }

  // 기보: 닉네임으로 최근 100판
  if (m === "GET" && path === "/api/records") {
    const name = (url.searchParams.get("user") ?? "").normalize("NFC").trim().toLowerCase();
    if (!name || name.length > 20) throw new HttpError(400, "bad_user", "닉네임을 입력해 주세요.");
    const u = await env.DB.prepare("SELECT * FROM users WHERE username_key = ?1 OR (is_bot = 1 AND lower(username) = ?1)").bind(name).first<UserRow>();
    if (!u) throw new HttpError(404, "no_user", "그런 닉네임이 없습니다.");
    const rows = await env.DB.prepare(
      `SELECT g.*, b.username AS black_name, w.username AS white_name FROM user_games ug
       JOIN games g ON g.id = ug.game_id
       LEFT JOIN users b ON b.id = g.black_id LEFT JOIN users w ON w.id = g.white_id
       WHERE ug.user_id = ? ORDER BY ug.finished_at DESC LIMIT 100`,
    ).bind(u.id).all<GameRow>();
    return json({ user: publicUser(u), games: rows.results.map((g) => recordSummary(g, u.id)) });
  }

  const gr = path.match(/^\/api\/games\/([^/]+)$/);
  if (m === "GET" && gr) {
    if (!UUID_RE.test(gr[1])) throw new HttpError(404, "not_found", "기보를 찾을 수 없습니다.");
    const g = await env.DB.prepare(
      `SELECT g.*, b.username AS black_name, w.username AS white_name FROM games g
       LEFT JOIN users b ON b.id = g.black_id LEFT JOIN users w ON w.id = g.white_id WHERE g.id = ?`,
    ).bind(gr[1]).first<GameRow>();
    if (!g) throw new HttpError(404, "not_found", "기보를 찾을 수 없습니다(오래된 기보는 지워집니다).");
    return json({
      id: g.id, mode: g.mode, rated: !!g.rated, winner: g.winner_id === g.black_id ? "black" : "white", reason: g.win_reason,
      players: { black: { username: g.black_name ?? "?" }, white: { username: g.white_name ?? "?" } },
      ratings: g.rated ? { black: { before: g.black_before, after: g.black_after }, white: { before: g.white_before, after: g.white_after } } : null,
      moves: JSON.parse(g.moves), finishedAt: g.finished_at,
    });
  }

  if (m === "GET" && path === "/api/stats") {
    const rows = await env.DB.prepare("SELECT rating FROM users WHERE games > 0 AND is_bot = 0 ORDER BY rating").all<{ rating: number }>();
    const r = rows.results.map((x) => x.rating);
    const dist = RANKS.map((k) => ({ rank: k.label, players: 0 }));
    for (const x of r) dist[rankFor(x).index].players++;
    return json({
      players: r.length,
      medianRating: r.length ? r[Math.floor(r.length / 2)] : null,
      topRankShare: r.length ? r.filter((x) => x >= TOP_MMR).length / r.length : 0,
      distribution: dist,
    });
  }

  // 매칭 대기: GET /api/match?mode=rated|casual|friend[&code=숫자 1~8자리]  (WebSocket)
  if (m === "GET" && path === "/api/match") {
    if (req.headers.get("upgrade") !== "websocket") throw new HttpError(426, "upgrade", "WebSocket이 필요합니다.");
    const u = await requireUser(env, wsToken(req));
    if (!u.email_verified) throw new HttpError(403, "unverified", "이메일 인증을 마쳐야 온라인 대국을 둘 수 있습니다.");
    const mode = url.searchParams.get("mode") as MatchMode;
    if (!MATCH_MODES.includes(mode)) throw new HttpError(400, "bad_mode", "잘못된 매치 종류입니다.");
    const code = url.searchParams.get("code") ?? "";
    if (mode === "friend" && !FRIEND_CODE_RE.test(code)) throw new HttpError(400, "bad_code", "코드는 숫자 1~8자리입니다.");
    const q = new URLSearchParams({ mode, ...(mode === "friend" ? { code } : {}) });
    return forwardWs(env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global")), `https://matchmaker/join?${q}`, u);
  }

  // 대국 접속: GET /api/games/<id>/ws  (WebSocket)
  const g = path.match(/^\/api\/games\/([^/]+)\/ws$/);
  if (m === "GET" && g) {
    if (req.headers.get("upgrade") !== "websocket") throw new HttpError(426, "upgrade", "WebSocket이 필요합니다.");
    if (!UUID_RE.test(g[1])) throw new HttpError(404, "not_found", "대국을 찾을 수 없습니다.");
    const u = await requireUser(env, wsToken(req));
    return forwardWs(env.GAME_ROOM.get(env.GAME_ROOM.idFromName(g[1])), "https://room/ws", u);
  }

  throw new HttpError(404, "not_found", "없는 주소입니다.");
}

interface GameRow {
  id: string; mode: string; rated: number; black_id: string; white_id: string; winner_id: string; win_reason: string; moves: string;
  black_before: number | null; black_after: number | null; white_before: number | null; white_after: number | null;
  created_at: string; finished_at: string; black_name: string | null; white_name: string | null;
}

function recordSummary(g: GameRow, userId: string) {
  const color = g.black_id === userId ? "black" : "white";
  return {
    id: g.id, mode: g.mode, rated: !!g.rated, color,
    opponent: color === "black" ? g.white_name : g.black_name,
    won: g.winner_id === userId, reason: g.win_reason,
    ratingBefore: color === "black" ? g.black_before : g.white_before,
    ratingAfter: color === "black" ? g.black_after : g.white_after,
    moveCount: (JSON.parse(g.moves) as unknown[]).length, finishedAt: g.finished_at,
  };
}

/** 정기 보정: 9단 비율이 0.05~0.1%를 벗어나면 1500점 기준으로 폭을 조금 되돌린다(비율은 사람만 센다, 조정은 AI 계정 포함). */
export async function calibrate(env: Env): Promise<number | null> {
  const rows = await env.DB.prepare("SELECT * FROM users WHERE games > 0").all<UserRow>();
  const players = rows.results;
  const factor = calibrationFactor(players.filter((u) => !u.is_bot).map((u) => u.mmr));
  if (factor === null) return null;
  const stmts = players.map((u) => {
    const r = rescale(toRated(u), factor);
    return env.DB.prepare("UPDATE users SET rating = ?, mmr = ? WHERE id = ?").bind(u.is_bot ? r.mmr : r.rating, r.mmr, u.id);
  });
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await env.DB.prepare("INSERT INTO calibrations (at, factor, players) VALUES (?, ?, ?)").bind(new Date().toISOString(), factor, players.filter((u) => !u.is_bot).length).run();
  return factor;
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: "internal", message: "서버 오류" }, 500);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(calibrate(env).then((f) => { if (f !== null) console.log(`점수 보정 ×${f.toFixed(3)}`); }));
  },
} satisfies ExportedHandler<Env>;
