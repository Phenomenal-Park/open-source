// 따목 Cloudflare Worker: 계정 API(D1) + 온라인 매칭·대국(Durable Objects, WebSocket). 화면(dist)은 정적 파일.
import { calibrationFactor, rescale, TOP_MMR } from "../src/rating/elo.ts";
import { RANKS, rankFor } from "../src/rating/ranks.ts";
import type { GameRule } from "../src/game/config.ts";
import { DEFAULT_CLOCK_MIN, FAVORITES_MAX, FRIEND_CLOCK_MINUTES, FRIEND_CODE_RE, MATCH_MODES, normalizeRule, WS_PROTOCOL, type MatchMode } from "../src/online/protocol.ts";
import { DEFAULT_BOARD_SIZE } from "../src/game/config.ts";
import { RECORDS_PER_USER } from "./room.ts";

/** 기보 목록 한 번에 보여 주는 판 수 */
const RECORDS_PAGE = 20;
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
    const token = bearer(req);
    const u = await requireUser(env, token);
    // 로그인 유지: 접속할 때마다 로그인 기한을 다시 30일로 늘린다(하루에 한 번만 기록)
    const now = Date.now();
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ? AND expires_at < ?")
      .bind(now + SESSION_TTL_MS, await hashToken(token!), now + SESSION_TTL_MS - 24 * 60 * 60 * 1000).run();
    return json({
      user: publicUser(u), verified: !!u.email_verified, activeGame: u.active_game, settings: { allowAi: !!u.allow_ai },
      admin: !!u.is_admin, bannedUntil: u.banned_until && u.banned_until > now ? u.banned_until : null,
    });
  }

  // 계정 삭제: 비밀번호를 다시 확인한다. 진행 중인 대국이 있으면 끝낸 뒤에.
  // 계정은 익명으로 바꾸고(닉네임 "deleted:…", 이메일·비밀번호·점수·전적·명승부 삭제), 다른 사람 기보에는 '탈퇴한 사용자'로 남는다.
  if (m === "POST" && path === "/api/account/delete") {
    await limited(env.AUTH_LIMITER, req); // 비밀번호 대입 막기
    const u = await requireUser(env, bearer(req));
    const body = await readJson(req);
    if (u.is_bot) throw new HttpError(403, "forbidden", "삭제할 수 없는 계정입니다.");
    if (typeof body.password !== "string" || !(await verifyPassword(body.password, u.password_hash))) {
      throw new HttpError(401, "bad_credentials", "비밀번호가 맞지 않습니다.");
    }
    if (u.active_game) throw new HttpError(409, "in_game", "진행 중인 대국을 끝낸 뒤 삭제할 수 있습니다.");
    const anon = `deleted:${u.id.slice(0, 8)}`;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
      env.DB.prepare("DELETE FROM email_codes WHERE user_id = ?").bind(u.id),
      env.DB.prepare("DELETE FROM favorites WHERE user_id = ?").bind(u.id),
      env.DB.prepare("DELETE FROM user_games WHERE user_id = ?").bind(u.id),
      env.DB.prepare("UPDATE games SET black_name = ? WHERE black_id = ?").bind(anon, u.id),
      env.DB.prepare("UPDATE games SET white_name = ? WHERE white_id = ?").bind(anon, u.id),
      // 아무도 보관하지 않게 된 기보는 지운다
      env.DB.prepare(
        `DELETE FROM games WHERE (black_id = ?1 OR white_id = ?1)
           AND NOT EXISTS (SELECT 1 FROM user_games ug WHERE ug.game_id = games.id)
           AND NOT EXISTS (SELECT 1 FROM favorites f WHERE f.game_id = games.id)`,
      ).bind(u.id),
      env.DB.prepare(
        `UPDATE users SET username = ?, username_key = ?, email = NULL, email_verified = 0, password_hash = '!',
           rating = 500, mmr = 1500, rd = 350, games = 0, wins = 0, losses = 0, draws = 0, win_streak = 0, max_rating = 500,
           allow_ai = 0, badges = '[]' WHERE id = ?`,
      ).bind(anon, `deleted:${u.id}`, u.id),
    ]);
    return json({ ok: true });
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

  // 기보 목록: 닉네임으로 최근 100판(페이지당 20판, 착수 데이터는 읽지 않음) + 그 사람의 명승부
  if (m === "GET" && path === "/api/records") {
    const name = (url.searchParams.get("user") ?? "").normalize("NFC").trim().toLowerCase();
    if (!name || name.length > 20) throw new HttpError(400, "bad_user", "닉네임을 입력해 주세요.");
    const u = await env.DB.prepare("SELECT * FROM users WHERE username_key = ?1 OR (is_bot = 1 AND lower(username) = ?1)").bind(name).first<UserRow>();
    if (!u) throw new HttpError(404, "no_user", "그런 닉네임이 없습니다.");
    const offset = Math.max(0, Math.min(RECORDS_PER_USER, Number(url.searchParams.get("offset")) || 0));
    const limit = Math.max(1, Math.min(RECORDS_PAGE, Number(url.searchParams.get("limit")) || RECORDS_PAGE, RECORDS_PER_USER - offset));
    // 대국 종류로 나눠 보기(레이팅·친선·친구) — 없으면 전체
    const modeParam = url.searchParams.get("mode");
    const mode = MATCH_MODES.includes(modeParam as MatchMode) ? modeParam : null;
    const modeSql = mode ? " AND g.mode = ?" : "";
    const modeArgs = mode ? [mode] : [];
    const [rows, total, favs] = await env.DB.batch([
      env.DB.prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM user_games ug JOIN games g ON g.id = ug.game_id
         LEFT JOIN users b ON b.id = g.black_id LEFT JOIN users w ON w.id = g.white_id
         WHERE ug.user_id = ?${modeSql} ORDER BY ug.finished_at DESC LIMIT ? OFFSET ?`,
      ).bind(u.id, ...modeArgs, limit, offset),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM user_games ug JOIN games g ON g.id = ug.game_id WHERE ug.user_id = ?${modeSql}`).bind(u.id, ...modeArgs),
      env.DB.prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM favorites f JOIN games g ON g.id = f.game_id
         LEFT JOIN users b ON b.id = g.black_id LEFT JOIN users w ON w.id = g.white_id
         WHERE f.user_id = ? ORDER BY f.created_at DESC`,
      ).bind(u.id),
    ]);
    return json({
      user: publicUser(u),
      games: (rows.results as GameRow[]).map((g) => recordSummary(g, u.id)),
      total: Math.min(RECORDS_PER_USER, (total.results[0] as { n: number }).n),
      offset,
      mode,
      favorites: (favs.results as GameRow[]).map((g) => recordSummary(g, u.id)),
      favoritesMax: FAVORITES_MAX,
    });
  }

  // 내 명승부 목록(기보 화면의 박제 버튼용)
  // 신고: 대국을 둔 사람만, 상대를 한 판에 한 번. 사유는 꼭 적는다(500자까지).
  if (m === "POST" && path === "/api/reports") {
    await limited(env.AUTH_LIMITER, req);
    const u = await requireUser(env, bearer(req));
    const body = await readJson(req);
    const gameId = String(body.gameId ?? ""), category = String(body.category ?? ""), reason = String(body.reason ?? "").trim();
    if (!UUID_RE.test(gameId)) throw new HttpError(400, "bad_game", "대국을 찾을 수 없습니다.");
    if (!REPORT_CATEGORIES.includes(category)) throw new HttpError(400, "bad_category", "신고 종류를 골라 주세요.");
    if (!reason || reason.length > 500) throw new HttpError(400, "bad_reason", "사유를 500자 안으로 적어 주세요.");
    const g = await env.DB.prepare("SELECT black_id, white_id FROM games WHERE id = ?").bind(gameId).first<{ black_id: string; white_id: string }>();
    if (!g || (g.black_id !== u.id && g.white_id !== u.id)) throw new HttpError(403, "not_your_game", "내가 둔 대국만 신고할 수 있습니다.");
    const target = g.black_id === u.id ? g.white_id : g.black_id;
    const r = await env.DB.prepare("INSERT OR IGNORE INTO reports (id, game_id, reporter_id, target_id, category, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), gameId, u.id, target, category, reason, new Date().toISOString()).run();
    if (!r.meta.changes) throw new HttpError(409, "already_reported", "이미 신고한 대국입니다.");
    return json({ ok: true });
  }

  // ── 관리자(is_admin) ──
  if (path.startsWith("/api/admin/")) {
    const admin = await requireUser(env, bearer(req));
    if (!admin.is_admin) throw new HttpError(403, "forbidden", "관리자만 쓸 수 있습니다.");
    // 열린 신고 목록(대상별 누적 신고 수 포함)
    if (m === "GET" && path === "/api/admin/reports") {
      const rows = await env.DB.prepare(
        `SELECT r.*, t.username AS target_name, p.username AS reporter_name, t.banned_until AS target_banned_until,
           (SELECT COUNT(*) FROM reports x WHERE x.target_id = r.target_id) AS target_reports
         FROM reports r JOIN users t ON t.id = r.target_id JOIN users p ON p.id = r.reporter_id
         WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 200`,
      ).all();
      return json({ reports: rows.results });
    }
    const rc = path.match(/^\/api\/admin\/reports\/([^/]+)\/close$/);
    if (m === "POST" && rc) {
      await env.DB.prepare("UPDATE reports SET status = 'done' WHERE id = ?").bind(rc[1]).run();
      return json({ ok: true });
    }
    const um = path.match(/^\/api\/admin\/users\/([^/]+)\/(ban|unban|reset)$/);
    if (m === "POST" && um) {
      const body = await readJson(req);
      const target = await env.DB.prepare("SELECT * FROM users WHERE id = ? OR username_key = ?").bind(um[1], um[1].normalize("NFC").toLowerCase()).first<UserRow>();
      if (!target || target.is_bot) throw new HttpError(404, "no_user", "그런 계정이 없습니다.");
      if (um[2] === "ban") {
        // days 없으면 무기한
        const days = Number(body.days);
        const until = Number.isFinite(days) && days > 0 ? Date.now() + days * 86_400_000 : 8_640_000_000_000_000;
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?").bind(until, String(body.reason ?? "").slice(0, 200), target.id),
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id),
        ]);
      } else if (um[2] === "unban") {
        await env.DB.prepare("UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ?").bind(target.id).run();
      } else {
        // 점수 초기화(전적은 남긴다): 처음 점수로, 확정 전 상태로
        await env.DB.prepare("UPDATE users SET rating = 500, mmr = 1500, rd = 350, win_streak = 0, max_rating = 500 WHERE id = ?").bind(target.id).run();
      }
      return json({ ok: true, user: publicUser((await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(target.id).first<UserRow>())!) });
    }
    throw new HttpError(404, "not_found", "없는 주소입니다.");
  }

  if (m === "GET" && path === "/api/favorites") {
    const u = await requireUser(env, bearer(req));
    const rows = await env.DB.prepare("SELECT game_id FROM favorites WHERE user_id = ?").bind(u.id).all<{ game_id: string }>();
    return json({ gameIds: rows.results.map((r) => r.game_id), max: FAVORITES_MAX });
  }

  // 명승부 박제/해제: { gameId, on }. 본인이 둔 끝난 대국만, 1인 FAVORITES_MAX판.
  if (m === "POST" && path === "/api/favorites") {
    const u = await requireUser(env, bearer(req));
    const body = await readJson(req);
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    if (!UUID_RE.test(gameId) || typeof body.on !== "boolean") throw new HttpError(400, "bad_request", "요청이 잘못되었습니다.");
    if (!body.on) {
      await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND game_id = ?").bind(u.id, gameId).run();
      // 해제한 기보가 더 이상 어디에도 필요 없으면 정리(최근 목록·다른 사람의 명승부에 있으면 그대로)
      await env.DB.prepare(
        `DELETE FROM games WHERE id = ? AND NOT EXISTS (SELECT 1 FROM user_games ug WHERE ug.game_id = games.id)
           AND NOT EXISTS (SELECT 1 FROM favorites f WHERE f.game_id = games.id)`,
      ).bind(gameId).run();
    } else {
      const g = await env.DB.prepare("SELECT black_id, white_id FROM games WHERE id = ?").bind(gameId).first<{ black_id: string; white_id: string }>();
      if (!g) throw new HttpError(404, "not_found", "기보를 찾을 수 없습니다.");
      if (g.black_id !== u.id && g.white_id !== u.id) throw new HttpError(403, "fav_forbidden", "내가 둔 대국만 박제할 수 있습니다.");
      // 한도 확인과 추가를 한 문장으로(동시에 두 번 눌러도 한도를 넘지 않게)
      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO favorites (user_id, game_id, created_at)
         SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM favorites WHERE user_id = ?1) < ?4`,
      ).bind(u.id, gameId, new Date().toISOString(), FAVORITES_MAX).run();
      if (!r.meta.changes) {
        const already = await env.DB.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND game_id = ?").bind(u.id, gameId).first();
        if (!already) throw new HttpError(409, "fav_full", `명승부는 ${FAVORITES_MAX}판까지입니다.`);
      }
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?").bind(u.id).first<{ n: number }>();
    return json({ on: body.on, count: n?.n ?? 0, max: FAVORITES_MAX });
  }

  const gr = path.match(/^\/api\/games\/([^/]+)$/);
  if (m === "GET" && gr) {
    if (!UUID_RE.test(gr[1])) throw new HttpError(404, "not_found", "기보를 찾을 수 없습니다.");
    const g = await env.DB.prepare(
      `SELECT g.*, b.username AS cur_black_name, w.username AS cur_white_name FROM games g
       LEFT JOIN users b ON b.id = g.black_id LEFT JOIN users w ON w.id = g.white_id WHERE g.id = ?`,
    ).bind(gr[1]).first<GameRow & { moves: string; board_size?: number; hidden_move?: number; hidden_index?: number | null; scan?: string | null; mine?: string | null }>();
    if (!g) throw new HttpError(404, "not_found", "기보를 찾을 수 없습니다(오래된 기보는 지워집니다).");
    const moves = JSON.parse(g.moves) as { row: number; col: number }[];
    const size = Math.max(DEFAULT_BOARD_SIZE, ...moves.flatMap((p) => [p.row + 1, p.col + 1]));
    return json({
      id: g.id, mode: g.mode, rated: !!g.rated,
      winner: g.winner_id === null ? null : g.winner_id === g.black_id ? "black" : "white", reason: g.win_reason,
      players: {
        black: { username: g.black_name ?? g.cur_black_name ?? "?", rating: g.black_rating, provisional: !!g.black_provisional },
        white: { username: g.white_name ?? g.cur_white_name ?? "?", rating: g.white_rating, provisional: !!g.white_provisional },
      },
      ratings: g.rated ? { black: { before: g.black_before, after: g.black_after }, white: { before: g.white_before, after: g.white_after } } : null,
      moves, boardSize: size === DEFAULT_BOARD_SIZE ? DEFAULT_BOARD_SIZE : size, finishedAt: g.finished_at,
      hiddenMove: !!g.hidden_move, hiddenIndex: g.hidden_index ?? null, scan: parseScan(g.scan),
      rule: gameRule(g), mine: parseScan(g.mine ?? null),
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

  // 매칭 대기: GET /api/match?mode=rated|casual|friend[&code=숫자 1~8자리][&rule=random|hidden|mine|plain 친선·친구][&time=분 친구]  (WebSocket)
  if (m === "GET" && path === "/api/match") {
    if (req.headers.get("upgrade") !== "websocket") throw new HttpError(426, "upgrade", "WebSocket이 필요합니다.");
    const u = await requireUser(env, wsToken(req));
    if (!u.email_verified) throw new HttpError(403, "unverified", "이메일 인증을 마쳐야 온라인 대국을 둘 수 있습니다.");
    if (u.banned_until && u.banned_until > Date.now()) throw new HttpError(403, "banned", "이용이 제한된 계정입니다.");
    const mode = url.searchParams.get("mode") as MatchMode;
    if (!MATCH_MODES.includes(mode)) throw new HttpError(400, "bad_mode", "잘못된 매치 종류입니다.");
    const code = url.searchParams.get("code") ?? "";
    if (mode === "friend" && !FRIEND_CODE_RE.test(code)) throw new HttpError(400, "bad_code", "코드는 숫자 1~8자리입니다.");
    // 규칙: 레이팅매치는 히든따목·지뢰따목 중 무작위. 친선매치는 무작위/히든따목/지뢰따목, 친구매치는 히든따목/지뢰따목/따목 중 고른다
    // (예전 값 rule=any|nohidden, hidden=0|1도 받는다)
    const r = url.searchParams.get("rule") ?? (url.searchParams.has("hidden") ? (url.searchParams.get("hidden") === "0" ? "nohidden" : "hidden") : null);
    const rule = normalizeRule(mode, r);
    // 시계: 레이팅·친선은 2분, 친구매치는 1·2·3·5·10분 중 선택(같은 시간끼리 짝짓는다)
    const t = Number(url.searchParams.get("time"));
    const time = mode === "friend" && (FRIEND_CLOCK_MINUTES as readonly number[]).includes(t) ? t : DEFAULT_CLOCK_MIN;
    const q = new URLSearchParams({ mode, rule, time: String(time), ...(mode === "friend" ? { code } : {}) });
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

/** 신고 종류: AI 사용 의심 · 대리 대국 · 다계정·조작 대국 · 고의 패배 · 비매너 · 기타 */
const REPORT_CATEGORIES = ["ai", "proxy", "multi", "throw", "manner", "other"];

/** 기보 목록에 쓰는 칸(착수 데이터 moves는 읽지 않는다) */
const SUMMARY_COLUMNS = `g.id, g.mode, g.rated, g.black_id, g.white_id, g.winner_id, g.win_reason, g.move_count,
  g.black_before, g.black_after, g.white_before, g.white_after, g.black_rating, g.white_rating,
  g.black_provisional, g.white_provisional, g.finished_at,
  COALESCE(g.black_name, b.username) AS black_name, COALESCE(g.white_name, w.username) AS white_name, g.hidden_move, g.rule`;

interface GameRow {
  id: string; mode: string; rated: number; black_id: string; white_id: string; winner_id: string | null; win_reason: string; move_count: number;
  black_before: number | null; black_after: number | null; white_before: number | null; white_after: number | null;
  black_rating: number | null; white_rating: number | null; black_provisional: number | null; white_provisional: number | null;
  finished_at: string; black_name: string | null; white_name: string | null; cur_black_name?: string | null; cur_white_name?: string | null;
  hidden_move?: number;
  rule?: string | null;
}

/** 기보의 규칙(예전 판은 rule이 없다: 히든이면 예전 히든룰 v1.3) */
function gameRule(g: { rule?: string | null; hidden_move?: number }): GameRule {
  if (g.rule === "plain" || g.rule === "hidden" || g.rule === "mine") return g.rule;
  return g.hidden_move ? "hidden13" : "plain";
}

function recordSummary(g: GameRow, userId: string) {
  const color = g.black_id === userId ? "black" : "white";
  const opp = color === "black" ? "white" : "black";
  return {
    id: g.id, mode: g.mode, rated: !!g.rated, color,
    opponent: g[`${opp}_name`],
    /** 대국 당시 상대 점수(매칭 시점) */
    opponentRating: g[`${opp}_rating`],
    opponentProvisional: !!g[`${opp}_provisional`],
    result: g.winner_id === null ? "draw" : g.winner_id === userId ? "win" : "loss",
    reason: g.win_reason,
    ratingBefore: g[`${color}_before`],
    ratingAfter: g[`${color}_after`],
    moveCount: g.move_count, finishedAt: g.finished_at,
    /** 대국 설정: 백 히든 모드였나 */
    hiddenMove: !!g.hidden_move,
    /** 대국 규칙 */
    rule: gameRule(g),
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

/** 기보에 저장한 흑 스캔 {"at","row","col"} → { at, pos } */
function parseScan(raw: string | null | undefined): { at: number; pos: { row: number; col: number } } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at: number; row: number; col: number };
    return Number.isInteger(v.at) && Number.isInteger(v.row) && Number.isInteger(v.col) ? { at: v.at, pos: { row: v.row, col: v.col } } : null;
  } catch {
    return null;
  }
}
