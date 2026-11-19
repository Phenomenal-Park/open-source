// 대국방(대국마다 Durable Object 하나). 착수는 src/game 엔진으로 검증하고, 끝나면 D1에 기록·점수 반영.
import { DurableObject } from "cloudflare:workers";
import { makeConfig, opponent, DEFAULT_BOARD_SIZE } from "../src/game/config.ts";
import { replayMoves } from "../src/game/gameState.ts";
import { tryMove } from "../src/game/rules.ts";
import type { GameState, Player, Position } from "../src/game/types.ts";
import { isProvisional, rateGame } from "../src/rating/elo.ts";
import { chooseMove } from "../src/ai/search.ts";
import { levelById } from "../src/ai/levels.ts";
import { rankFor } from "../src/rating/ranks.ts";
import {
  DISCONNECT_MS, HEARTBEAT_TIMEOUT_MS, PING, PONG, WS_PROTOCOL,
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
  moves: Position[];
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
    const r = replayMoves(makeConfig(d.boardSize), d.moves);
    if (!r.ok) throw new Error("stored moves are invalid");
    return r.state;
  }

  /** 매칭 직후 한 번(Matchmaker가 RPC로 호출). 두 사람 모두 45초 안에 들어와야 한다. */
  async init(init: RoomInit): Promise<void> {
    if (await this.load()) return;
    const deadline = Date.now() + this.disconnectMs;
    this.data = {
      ...init, boardSize: DEFAULT_BOARD_SIZE, moves: [], status: "playing", result: null,
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
    this.ctx.waitUntil(
      new Promise((r) => setTimeout(r, 400)).then(async () => {
        const cur = await this.load();
        if (!cur || cur.status !== "playing" || cur.moves.length !== moveNo) return;
        const s = this.replay(cur);
        await this.applyMove(s.currentPlayer, chooseMove(s, level));
      }),
    );
  }

  /** 검증 후 착수. 실패하면 오류 코드(없으면 null). */
  private async applyMove(color: Player, pos: Position): Promise<"not_your_turn" | "illegal" | null> {
    const d = this.data!;
    const r = tryMove(this.replay(d), pos, color);
    if (!r.ok) return r.reason === "not-your-turn" ? "not_your_turn" : "illegal";
    d.moves.push({ row: pos.row, col: pos.col });
    if (r.state.isFinished && r.state.winner && r.state.winReason) {
      await this.finish(r.state.winner, r.state.winReason);
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

    if (msg.type === "move") {
      if (msg.moveNo !== d.moves.length) return this.sendState(ws, color); // 오래된 화면에서 보낸 수
      const err = await this.applyMove(color, { row: msg.row, col: msg.col });
      if (err) {
        this.sendTo(ws, { type: "error", code: err, message: err === "not_your_turn" ? "상대 차례입니다." : "둘 수 없는 자리입니다." });
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
    let next = Math.min(...COLORS.map((c) => d.deadlines[c] ?? Infinity));
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

  private async finish(winner: Player, reason: ResultReason) {
    const d = this.data!;
    if (d.status !== "playing") return;
    d.status = "finished";
    d.deadlines = {};
    d.result = { winner, reason };
    await this.ctx.storage.deleteAlarm();
    const winnerId = d[winner].id;
    const now = new Date().toISOString();
    try {
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];
      let before: Partial<Record<Player, number>> = {}, after: Partial<Record<Player, number>> = {};
      if (d.rated) {
        const rows = await db.prepare("SELECT * FROM users WHERE id IN (?, ?)").bind(d.black.id, d.white.id).all<UserRow>();
        const row = (c: Player) => rows.results.find((u) => u.id === d[c].id)!;
        const loser = opponent(winner);
        const change = rateGame(toRated(row(winner)), toRated(row(loser)));
        // AI 계정은 표시 점수 = 실력 점수(승급 보너스 없음)
        for (const [c, p] of [[winner, change.winner], [loser, change.loser]] as const) {
          if (d[c].bot) { p.after.rating = p.after.mmr; p.bonus = 0; }
        }
        const upd = (c: Player, p: typeof change.winner, won: boolean) =>
          db.prepare(`UPDATE users SET rating = ?, mmr = ?, rd = ?, games = ?, win_streak = ?, ${won ? "wins = wins + 1" : "losses = losses + 1"}, active_game = NULL WHERE id = ?`)
            .bind(p.after.rating, p.after.mmr, p.after.rd, p.after.games, p.after.winStreak, d[c].id);
        stmts.push(upd(winner, change.winner, true), upd(loser, change.loser, false));
        before = { [winner]: change.winner.before.rating, [loser]: change.loser.before.rating };
        after = { [winner]: change.winner.after.rating, [loser]: change.loser.after.rating };
        const rowOf = (u: typeof change.winner) => ({
          before: u.before.rating, after: u.after.rating, bonus: u.bonus, rank: rankFor(u.after.rating).label, provisional: isProvisional(u.after),
        });
        d.result.ratings = { [winner]: rowOf(change.winner), [loser]: rowOf(change.loser) } as Record<Player, ReturnType<typeof rowOf>>;
        d.result.upset = change.upset;
      } else {
        stmts.push(db.prepare("UPDATE users SET active_game = NULL WHERE id IN (?, ?) AND active_game = ?").bind(d.black.id, d.white.id, d.id));
      }
      stmts.push(
        db.prepare(
          "INSERT OR IGNORE INTO games (id, mode, rated, black_id, white_id, winner_id, win_reason, moves, black_before, black_after, white_before, white_after, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(d.id, d.mode, d.rated ? 1 : 0, d.black.id, d.white.id, winnerId, reason, JSON.stringify(d.moves),
          before.black ?? null, after.black ?? null, before.white ?? null, after.white ?? null, d.createdAt, now),
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

  private snapshot(): GameSnapshot {
    const d = this.data!;
    const now = Date.now();
    const disconnected: GameSnapshot["disconnected"] = {};
    for (const c of COLORS) if (d.deadlines[c]) disconnected[c] = Math.max(0, d.deadlines[c]! - now);
    const p = (x: RoomPlayer) => ({ username: x.username, rank: x.rank, rating: x.rating, provisional: x.provisional, bot: !!x.bot });
    return {
      id: d.id, mode: d.mode, rated: d.rated, boardSize: d.boardSize, players: { black: p(d.black), white: p(d.white) },
      moves: d.moves, status: d.status, result: d.result, disconnected,
    };
  }

  private sendTo(ws: WebSocket, msg: ServerMessage) {
    try { ws.send(JSON.stringify(msg)); } catch { /* */ }
  }

  private sendState(ws: WebSocket, color: Player) {
    this.sendTo(ws, { type: "state", you: color, game: this.snapshot() });
  }

  private broadcast() {
    const game = this.snapshot();
    for (const ws of this.ctx.getWebSockets()) {
      const you = this.ctx.getTags(ws)[0] as Player;
      this.sendTo(ws, { type: "state", you, game });
    }
  }
}

/**
 * 사람별 기보를 최근 limit판(기본 100)만 남긴다. 어느 쪽 목록에도 없게 된 대국만 실제로 지운다.
 * 점수는 users 테이블에만 있으므로 기보를 지워도 점수는 바뀌지 않는다.
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
      db.prepare(`DELETE FROM games WHERE id IN (${marks}) AND NOT EXISTS (SELECT 1 FROM user_games ug WHERE ug.game_id = games.id)`).bind(...ids),
    ]);
  }
}
