// 대국방(대국마다 Durable Object 하나). 착수는 src/game 엔진으로 검증하고, 끝나면 D1에 기록·점수 반영.
import { DurableObject } from "cloudflare:workers";
import { makeConfig, opponent, DEFAULT_BOARD_SIZE } from "../src/game/config.ts";
import { replayMoves } from "../src/game/gameState.ts";
import { canUseHidden, forfeitHidden, tryMove, viewFor, type MoveOptions } from "../src/game/rules.ts";
import type { GameState, Player, Position } from "../src/game/types.ts";
import { isProvisional, rateDraw, rateGame, type PlayerUpdate } from "../src/rating/elo.ts";
import { chooseMove } from "../src/ai/search.ts";
import { chooseBlackMove, chooseWhiteMove } from "../src/ai/hidden.ts";
import { levelById } from "../src/ai/levels.ts";
import { rankFor } from "../src/rating/ranks.ts";
import {
  DISCONNECT_MS, HEARTBEAT_TIMEOUT_MS, HIDDEN_CAPTURE_TARGET, HIDDEN_GRACE_MS, HIDDEN_MS, PING, PONG, WS_PROTOCOL,
  type ClientMessage, type GameSnapshot, type MatchMode, type OnlineResult, type ResultReason, type ServerMessage,
} from "../src/online/protocol.ts";
import { toRated, type UserRow } from "./users.ts";

export interface RoomPlayer {
  id: string;
  username: string;
  rating: number;
  rank: string;
  provisional: boolean;
  /** AI 계정이면 기력 단계 id(서버가 대신 둔다) */
  bot?: string;
}

/** 사람별 기보 보관 개수 */
export const RECORDS_PER_USER = 100;

export interface RoomInit {
  id: string;
  mode: MatchMode;
  rated: boolean;
  black: RoomPlayer;
  white: RoomPlayer;
}

interface RoomData extends RoomInit {
  boardSize: number;
  /** (실험용) 흑 두 번째 수 제한 — 시작 때의 서버 설정을 그 판 끝까지 쓴다 */
  secondMoveMinDistance?: number;
  moves: Position[];
  /** 백 히든 규칙 — 시작 때의 서버 설정을 그 판 끝까지 쓴다 */
  hiddenMove?: boolean;
  /** 백 히든 수가 moves의 몇 번째인가 */
  hiddenIndex?: number | null;
  /** 흑이 그 자리를 눌러 드러났다(기보를 다시 두는 것만으로는 알 수 없어 따로 저장) */
  hiddenRevealed?: boolean;
  /** 히든을 누르고 10초 안에 두지 못해 기회가 사라졌다 */
  hiddenForfeit?: boolean;
  /** 백이 히든을 누른 시각 + HIDDEN_MS (아직 두지 않았으면) */
  hiddenArmedUntil?: number | null;
  status: "playing" | "finished" | "aborted";
  result: OnlineResult | null;
  /** 이 시각까지 돌아오지 않으면 패배(접속 끊김) */
  deadlines: Partial<Record<Player, number>>;
  joined: Record<Player, boolean>;
  createdAt: string;
}

const COLORS: readonly Player[] = ["black", "white"];

export class GameRoom extends DurableObject<Env> {
  private data: RoomData | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // PING에는 서버를 깨우지 않고 자동 응답(마지막 응답 시각은 getWebSocketAutoResponseTimestamp로 확인)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /** 판 크기(테스트에서만 바꾼다) */
  private get boardSize(): number {
    const v = Number(this.env.BOARD_SIZE);
    return Number.isInteger(v) && v >= 5 ? v : DEFAULT_BOARD_SIZE;
  }

  private get disconnectMs(): number {
    const v = Number(this.env.DISCONNECT_MS);
    return Number.isFinite(v) && v > 0 ? v : DISCONNECT_MS;
  }

  private get heartbeatTimeoutMs(): number {
    const v = Number(this.env.HEARTBEAT_TIMEOUT_MS);
    return Number.isFinite(v) && v > 0 ? v : HEARTBEAT_TIMEOUT_MS;
  }

  /** 이 연결에서 마지막으로 신호(PING 자동 응답 또는 메시지)가 온 시각 */
  private lastSeen(ws: WebSocket): number {
    const at = (ws.deserializeAttachment() as { at?: number } | null)?.at ?? 0;
    return Math.max(at, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0);
  }

  private openSockets(color: Player): WebSocket[] {
    return this.ctx.getWebSockets(color).filter((x) => x.readyState === WebSocket.OPEN);
  }

  private async load(): Promise<RoomData | undefined> {
    this.data ??= await this.ctx.storage.get<RoomData>("room");
    return this.data;
  }

  private async save() {
    await this.ctx.storage.put("room", this.data!);
  }

  private replay(d: RoomData): GameState {
    const r = replayMoves(roomConfig(d), d.moves, d.hiddenIndex ?? null);
    if (!r.ok) throw new Error("stored moves are invalid");
    let s = r.state;
    if (d.hiddenRevealed && s.hidden && !s.hidden.revealed) s = { ...s, hidden: { ...s.hidden, revealed: true } };
    if (d.hiddenForfeit) s = forfeitHidden(s);
    return s;
  }

  /** 매칭 직후 한 번(Matchmaker가 RPC로 호출). 두 사람 모두 45초 안에 들어와야 한다. */
  async init(init: RoomInit): Promise<void> {
    if (await this.load()) return;
    const deadline = Date.now() + this.disconnectMs;
    this.data = {
      ...init, boardSize: this.boardSize, secondMoveMinDistance: Number(this.env.SECOND_MOVE_MIN_DISTANCE) || 0, moves: [], status: "playing", result: null,
      hiddenMove: this.env.HIDDEN_MOVE !== "0", hiddenIndex: null, hiddenRevealed: false, hiddenForfeit: false, hiddenArmedUntil: null,
      deadlines: {}, joined: { black: !!init.black.bot, white: !!init.white.bot }, createdAt: new Date().toISOString(),
    };
    for (const c of COLORS) if (!init[c].bot) this.data.deadlines[c] = deadline;
    await this.save();
    await this.ctx.storage.setAlarm(deadline);
    this.maybeBotTurn();
  }

  /** AI 차례면 잠깐 뒤 서버가 대신 둔다. */
  private maybeBotTurn() {
    const d = this.data!;
    if (d.status !== "playing") return;
    const state = this.replay(d);
    const level = d[state.currentPlayer].bot && levelById(d[state.currentPlayer].bot!);
    if (!level) return;
    const moveNo = d.moves.length;
    const revealed = !!d.hiddenRevealed;
    this.ctx.waitUntil(
      new Promise((r) => setTimeout(r, 400)).then(async () => {
        const cur = await this.load();
        if (!cur || cur.status !== "playing" || cur.moves.length !== moveNo || !!cur.hiddenRevealed !== revealed) return;
        const s = this.replay(cur);
        if (!cur.hiddenMove) return void (await this.applyMove(s.currentPlayer, chooseMove(s, level)));
        // 백 히든 판: 흑 AI는 흑에게 보이는 판만 보고, 백 AI는 숨겨 둘지도 정한다
        if (s.currentPlayer === "black") return void (await this.applyMove("black", chooseBlackMove(viewFor(s, "black"), level)));
        const { move, hidden } = chooseWhiteMove(s, level);
        await this.applyMove("white", move, { hidden });
      }),
    );
  }

  /** 검증 후 착수. 실패하면 오류 코드(없으면 null). */
  private async applyMove(color: Player, pos: Position, opts: MoveOptions = {}): Promise<"not_your_turn" | "illegal" | "hidden_required" | null> {
    const d = this.data!;
    // 히든을 누른 뒤에는 숨겨 두는 수만 받는다
    if (color === "white" && d.hiddenArmedUntil && !opts.hidden) return "hidden_required";
    const r = tryMove(this.replay(d), pos, color, opts);
    if (!r.ok) return r.reason === "not-your-turn" ? "not_your_turn" : "illegal";
    if (r.revealedHidden) {
      // 흑이 숨은 돌 자리를 눌렀다: 돌이 드러나고 흑 차례 그대로
      d.hiddenRevealed = true;
      await this.save();
      this.broadcast();
      this.maybeBotTurn();
      return null;
    }
    if (opts.hidden) { d.hiddenIndex = d.moves.length; d.hiddenArmedUntil = null; }
    d.moves.push({ row: pos.row, col: pos.col });
    if (r.state.isFinished && r.state.winReason) {
      await this.finish(r.state.winner, r.state.winReason); // winner null = 무승부(판이 다 참)
      return null;
    }
    await this.save();
    this.broadcast();
    this.maybeBotTurn();
    return null;
  }

  async fetch(request: Request): Promise<Response> {
    const d = await this.load();
    if (!d) return new Response("not found", { status: 404 });
    const userId = request.headers.get("x-user-id");
    const color: Player | null = d.black.id === userId ? "black" : d.white.id === userId ? "white" : null;
    if (!color) return new Response("forbidden", { status: 403 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [color]);
    server.serializeAttachment({ at: Date.now() });
    if (d.status === "playing") {
      delete d.deadlines[color];
      d.joined[color] = true;
      await this.save();
      await this.scheduleAlarm();
    }
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": WS_PROTOCOL } });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const d = await this.load();
    const color = this.ctx.getTags(ws)[0] as Player | undefined;
    if (!d || !color) return;
    ws.serializeAttachment({ at: Date.now() });
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return this.sendTo(ws, { type: "error", code: "bad_message", message: "잘못된 메시지" });
    }
    if (msg.type === "ping") return;
    if (d.status !== "playing") return this.sendState(ws, color);

    if (msg.type === "resign") return this.finish(opponent(color), "resign");

    if (msg.type === "hidden") {
      // 백 히든 누름: 10초 안에 숨겨 둬야 한다(못 두면 alarm에서 기회 소멸)
      if (color !== "white" || !d.hiddenMove || d.hiddenArmedUntil || !canUseHidden(this.replay(d))) return this.sendState(ws, color);
      d.hiddenArmedUntil = Date.now() + HIDDEN_MS;
      await this.save();
      await this.scheduleAlarm();
      this.broadcast();
      return;
    }

    if (msg.type === "move") {
      if (msg.moveNo !== d.moves.length) return this.sendState(ws, color); // 오래된 화면에서 보낸 수
      const hidden = msg.hidden === true;
      if (hidden && (!d.hiddenArmedUntil || Date.now() > d.hiddenArmedUntil + HIDDEN_GRACE_MS)) return this.sendState(ws, color);
      const err = await this.applyMove(color, { row: msg.row, col: msg.col }, { hidden });
      if (err) {
        this.sendTo(ws, { type: "error", code: err, message: err === "not_your_turn" ? "상대 차례입니다." : err === "hidden_required" ? "숨길 자리에 두세요." : "둘 수 없는 자리입니다." });
        this.sendState(ws, color);
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    try { ws.close(); } catch { /* */ }
    await this.onLeave(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.onLeave(ws);
  }

  private async onLeave(ws: WebSocket) {
    const d = await this.load();
    const color = this.ctx.getTags(ws)[0] as Player | undefined;
    if (!d || !color || d.status !== "playing") return;
    const stillHere = this.ctx.getWebSockets(color).some((x) => x !== ws && x.readyState === WebSocket.OPEN);
    if (stillHere || d.deadlines[color]) return;
    d.deadlines[color] = Date.now() + this.disconnectMs;
    await this.save();
    await this.scheduleAlarm();
    this.broadcast();
  }

  private async scheduleAlarm() {
    const d = this.data!;
    let next = Math.min(...COLORS.map((c) => d.deadlines[c] ?? Infinity), d.hiddenArmedUntil ? d.hiddenArmedUntil + HIDDEN_GRACE_MS : Infinity);
    // 대국 중 접속해 있는 사람이 있으면 신호 확인을 위해 주기적으로 깨어난다
    if (d.status === "playing" && COLORS.some((c) => !d[c].bot && this.openSockets(c).length)) {
      next = Math.min(next, Date.now() + Math.min(10_000, this.heartbeatTimeoutMs / 2));
    }
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
    else await this.ctx.storage.deleteAlarm();
  }

  /** 신호가 끊긴 연결(조용히 끊김)을 찾아 닫고, 그 시점부터 접속 끊김 시간을 센다. 바뀌었으면 true */
  private sweepHeartbeats(now: number): boolean {
    const d = this.data!;
    let changed = false;
    for (const c of COLORS) {
      if (d[c].bot || d.deadlines[c] || !d.joined[c]) continue;
      const open = this.openSockets(c);
      const alive = open.some((ws) => now - this.lastSeen(ws) < this.heartbeatTimeoutMs);
      if (alive) continue;
      for (const ws of open) { try { ws.close(4002, "heartbeat timeout"); } catch { /* */ } }
      d.deadlines[c] = now + this.disconnectMs;
      changed = true;
    }
    return changed;
  }

  async alarm() {
    const d = await this.load();
    if (!d || d.status !== "playing") return;
    const now = Date.now();
    if (d.hiddenArmedUntil && now >= d.hiddenArmedUntil + HIDDEN_GRACE_MS) {
      // 히든을 누르고 시간 안에 두지 못함: 그 판의 히든 기회 소멸(백 차례 그대로)
      d.hiddenArmedUntil = null;
      d.hiddenForfeit = true;
      await this.save();
      this.broadcast();
    }
    if (this.sweepHeartbeats(now)) {
      await this.save();
      this.broadcast();
    }
    const expired = COLORS.filter((c) => (d.deadlines[c] ?? Infinity) <= now).sort((a, b) => d.deadlines[a]! - d.deadlines[b]!);
    if (!expired.length) return this.scheduleAlarm();
    if (!d.joined.black && !d.joined.white) return this.abort(); // 둘 다 들어오지 않음: 무효
    await this.finish(opponent(expired[0]), "disconnect");
  }

  private async abort() {
    const d = this.data!;
    d.status = "aborted";
    d.deadlines = {};
    await this.env.DB.prepare("UPDATE users SET active_game = NULL WHERE id IN (?, ?) AND active_game = ?").bind(d.black.id, d.white.id, d.id).run();
    await this.save();
    this.broadcast();
  }

  private async finish(winner: Player | null, reason: ResultReason) {
    const d = this.data!;
    if (d.status !== "playing") return;
    d.status = "finished";
    d.deadlines = {};
    d.hiddenArmedUntil = null;
    d.result = { winner, reason };
    await this.ctx.storage.deleteAlarm();
    const winnerId = winner ? d[winner].id : null;
    const now = new Date().toISOString();
    try {
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];
      const before: Partial<Record<Player, number>> = {}, after: Partial<Record<Player, number>> = {};
      if (d.rated) {
        const rows = await db.prepare("SELECT * FROM users WHERE id IN (?, ?)").bind(d.black.id, d.white.id).all<UserRow>();
        const row = (c: Player) => rows.results.find((u) => u.id === d[c].id)!;
        // 점수 계산: 승패는 rateGame, 무승부는 rateDraw(양쪽 0.5승)
        const updates: Record<Player, PlayerUpdate> = winner
          ? (() => {
              const ch = rateGame(toRated(row(winner)), toRated(row(opponent(winner))));
              d.result!.upset = ch.upset;
              return { [winner]: ch.winner, [opponent(winner)]: ch.loser } as Record<Player, PlayerUpdate>;
            })()
          : (() => {
              const ch = rateDraw(toRated(row("black")), toRated(row("white")));
              return { black: ch.a, white: ch.b };
            })();
        for (const c of COLORS) {
          const u = updates[c];
          if (d[c].bot) { u.after.rating = u.after.mmr; u.bonus = 0; } // AI 계정은 표시 점수 = 실력 점수
          const outcome = winner === null ? "draws = draws + 1" : winner === c ? "wins = wins + 1" : "losses = losses + 1";
          // 통산 전적·최고 점수는 계정에만 쌓인다(기보 정리와 무관)
          stmts.push(db.prepare(
            `UPDATE users SET rating = ?, mmr = ?, rd = ?, games = ?, win_streak = ?, ${outcome}, max_rating = MAX(max_rating, ?), active_game = NULL WHERE id = ?`,
          ).bind(u.after.rating, u.after.mmr, u.after.rd, u.after.games, u.after.winStreak, u.after.rating, d[c].id));
          before[c] = u.before.rating;
          after[c] = u.after.rating;
        }
        d.result.ratings = Object.fromEntries(COLORS.map((c) => [c, {
          before: updates[c].before.rating, after: updates[c].after.rating, bonus: updates[c].bonus,
          rank: rankFor(updates[c].after.rating).label, provisional: isProvisional(updates[c].after),
        }])) as Record<Player, NonNullable<OnlineResult["ratings"]>[Player]>;
      } else {
        stmts.push(db.prepare("UPDATE users SET active_game = NULL WHERE id IN (?, ?) AND active_game = ?").bind(d.black.id, d.white.id, d.id));
      }
      stmts.push(
        db.prepare(
          `INSERT OR IGNORE INTO games (id, mode, rated, black_id, white_id, winner_id, win_reason, moves, move_count,
             black_before, black_after, white_before, white_after,
             black_name, white_name, black_rating, white_rating, black_provisional, white_provisional, created_at, finished_at,
             hidden_move, hidden_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(d.id, d.mode, d.rated ? 1 : 0, d.black.id, d.white.id, winnerId, reason, JSON.stringify(d.moves), d.moves.length,
          before.black ?? null, after.black ?? null, before.white ?? null, after.white ?? null,
          // 대국 당시(매칭 시점) 닉네임·점수 스냅샷
          d.black.username, d.white.username, d.black.rating, d.white.rating, d.black.provisional ? 1 : 0, d.white.provisional ? 1 : 0,
          d.createdAt, now, d.hiddenMove ? 1 : 0, d.hiddenIndex ?? null),
      );
      for (const c of COLORS) {
        stmts.push(db.prepare("INSERT OR IGNORE INTO user_games (user_id, game_id, finished_at) VALUES (?, ?, ?)").bind(d[c].id, d.id, now));
      }
      await db.batch(stmts);
      await pruneRecords(db, [d.black.id, d.white.id], Number(this.env.RECORDS_LIMIT) || RECORDS_PER_USER);
    } catch (e) {
      console.error("finish: failed to record result", e);
    }
    await this.save();
    this.broadcast();
  }

  /** 보는 사람(색)마다 다른 화면: 흑에게는 숨은 백 돌이 보이지 않는다 */
  private snapshot(viewer: Player): GameSnapshot {
    const d = this.data!;
    const now = Date.now();
    const disconnected: GameSnapshot["disconnected"] = {};
    for (const c of COLORS) if (d.deadlines[c]) disconnected[c] = Math.max(0, d.deadlines[c]! - now);
    const p = (x: RoomPlayer) => ({ username: x.username, rank: x.rank, rating: x.rating, provisional: x.provisional, bot: !!x.bot });
    const view = viewFor(this.replay(d), viewer);
    return {
      id: d.id, mode: d.mode, rated: d.rated, boardSize: d.boardSize, secondMoveMinDistance: d.secondMoveMinDistance ?? 0, players: { black: p(d.black), white: p(d.white) },
      moves: view.moves, status: d.status, result: d.result, disconnected,
      hiddenMove: !!d.hiddenMove, view,
      ...(d.hiddenArmedUntil ? { hiddenArmedMs: Math.max(0, d.hiddenArmedUntil - now) } : {}),
    };
  }

  private sendTo(ws: WebSocket, msg: ServerMessage) {
    try { ws.send(JSON.stringify(msg)); } catch { /* */ }
  }

  private sendState(ws: WebSocket, color: Player) {
    this.sendTo(ws, { type: "state", you: color, game: this.snapshot(color) });
  }

  private broadcast() {
    const games: Partial<Record<Player, GameSnapshot>> = {};
    for (const ws of this.ctx.getWebSockets()) {
      const you = this.ctx.getTags(ws)[0] as Player;
      this.sendTo(ws, { type: "state", you, game: (games[you] ??= this.snapshot(you)) });
    }
  }
}

/** 이 대국의 규칙: 백 히든 판은 흑·백 모두 10개 따내면 승리 */
export function roomConfig(d: { boardSize: number; secondMoveMinDistance?: number; hiddenMove?: boolean }) {
  return makeConfig(d.boardSize, {
    secondMoveMinDistance: d.secondMoveMinDistance ?? 0,
    ...(d.hiddenMove ? { hiddenMove: true, captureTarget: { ...HIDDEN_CAPTURE_TARGET } } : {}),
  });
}

/**
 * 사람별 기보를 최근 limit판(기본 100)만 남긴다.
 * 실제로 지우는 기보는 (1) 어느 쪽 최근 목록에도 없고 (2) 누구의 명승부(박제)도 아닌 것뿐이다.
 * 점수·통산 전적은 users 테이블에만 있으므로 기보를 지워도 바뀌지 않는다. 몇 번을 다시 실행해도 결과가 같다.
 */
export async function pruneRecords(db: D1Database, userIds: string[], limit = RECORDS_PER_USER) {
  for (const uid of userIds) {
    const old = await db
      .prepare("SELECT game_id FROM user_games WHERE user_id = ? ORDER BY finished_at DESC LIMIT -1 OFFSET ?")
      .bind(uid, limit)
      .all<{ game_id: string }>();
    if (!old.results.length) continue;
    const ids = old.results.map((r) => r.game_id);
    const marks = ids.map(() => "?").join(", ");
    await db.batch([
      db.prepare(`DELETE FROM user_games WHERE user_id = ? AND game_id IN (${marks})`).bind(uid, ...ids),
      db.prepare(
        `DELETE FROM games WHERE id IN (${marks})
           AND NOT EXISTS (SELECT 1 FROM user_games ug WHERE ug.game_id = games.id)
           AND NOT EXISTS (SELECT 1 FROM favorites f WHERE f.game_id = games.id)`,
      ).bind(...ids),
    ]);
  }
}
