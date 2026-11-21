// 매칭 대기열(전역 Durable Object 하나).
//   레이팅매치: 실력 점수가 가까운 사람(기다릴수록 범위가 넓어짐, pairing.ts), 15초 뒤 가장 가까운 AI 3개 중 하나(허용 시)
//   친선매치: 친선매치를 누른 사람 중 규칙 선택이 맞는 무작위 1명(아무거나/히든룰/노히든룰, 3분)
//   친구매치: 같은 코드·같은 시간을 고르고 규칙 선택이 맞는 사람
//   레이팅매치는 늘 히든룰(백 히든 1번 + 흑 스캔 1번)
import { DurableObject } from "cloudflare:workers";
import { agreedRule, HEARTBEAT_TIMEOUT_MS, PING, PONG, WS_PROTOCOL, type MatchMode, type MatchRule, type ServerMessage } from "../src/online/protocol.ts";
import { rankFor } from "../src/rating/ranks.ts";
import { isProvisional } from "../src/rating/elo.ts";
import { dueForAi, nextCheck, pickBot, pickPairs, type Waiter } from "./pairing.ts";
import type { GameRoom, RoomInit, RoomPlayer } from "./room.ts";

interface Ticket {
  key: string;
  userId: string;
  mode: MatchMode;
  code: string | null;
  /** 규칙 선택(레이팅매치는 늘 hidden) */
  rule: MatchRule;
  /** 처음 시간(분) */
  clockMin: number;
  mmr: number;
  allowAi: boolean;
  joinedAt: number;
  taken?: boolean;
}

interface Row {
  id: string;
  username: string;
  rating: number;
  mmr: number;
  rd: number;
  active_game: string | null;
  allow_ai: number;
  is_bot: number;
  bot_level: string | null;
}

function send(ws: WebSocket, msg: ServerMessage) {
  try { ws.send(JSON.stringify(msg)); } catch { /* 이미 닫힘 */ }
}

const player = (r: Row): RoomPlayer => ({
  id: r.id, username: r.username, rating: r.rating, rank: rankFor(r.rating).label, provisional: isProvisional(r),
  ...(r.is_bot ? { bot: r.bot_level! } : {}),
});

export class Matchmaker extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /** 기다리는 중이고 신호가 살아 있는 연결들(조용히 끊긴 사람과는 매칭하지 않는다) */
  private open(): { ws: WebSocket; t: Ticket }[] {
    const now = Date.now();
    const timeout = Number(this.env.HEARTBEAT_TIMEOUT_MS) || HEARTBEAT_TIMEOUT_MS;
    return this.ctx.getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, t: ws.deserializeAttachment() as Ticket }))
      .filter((x) => x.t && !x.t.taken)
      .filter((x) => now - Math.max(x.t.joinedAt, this.ctx.getWebSocketAutoResponseTimestamp(x.ws)?.getTime() ?? 0) < timeout);
  }

  private take(ws: WebSocket, t: Ticket) {
    ws.serializeAttachment({ ...t, taken: true });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = request.headers.get("x-user-id")!;
    const mode = url.searchParams.get("mode") as MatchMode;
    const code = mode === "friend" ? url.searchParams.get("code") : null;
    const rule = (url.searchParams.get("rule") as MatchRule | null) ?? "hidden";
    const clockMin = Number(url.searchParams.get("time")) || 3;

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const response = new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": WS_PROTOCOL } });

    const me = await this.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<Row>();
    const ticket: Ticket = {
      key: crypto.randomUUID(), userId, mode, code, rule, clockMin, mmr: me?.mmr ?? 1500, allowAi: !!me?.allow_ai, joinedAt: Date.now(),
    };
    server.serializeAttachment(ticket);

    // 이미 진행 중인 대국이 있으면 그 대국으로 돌려보낸다
    if (!me || me.active_game) {
      this.take(server, ticket);
      if (me?.active_game) send(server, { type: "matched", gameId: me.active_game });
      else send(server, { type: "error", code: "unauthorized", message: "계정을 찾을 수 없습니다." });
      server.close(1000, "done");
      return response;
    }

    // 여기부터 짝짓기까지 await 없이(같은 상대를 동시에 두 번 가져가지 않도록)
    for (const { ws, t } of this.open()) {
      if (ws !== server && t.userId === userId) { this.take(ws, t); try { ws.close(4001, "replaced"); } catch { /* */ } }
    }
    send(server, { type: "waiting" });
    if (mode === "rated") {
      this.matchRated();
    } else {
      const others = this.open().filter(({ ws, t }) => ws !== server && t.userId !== userId && t.mode === mode && t.code === code && agreedRule(t.rule ?? "hidden", rule) !== null && (t.clockMin ?? 3) === clockMin);
      if (others.length) {
        const other = others[Math.floor(Math.random() * others.length)];
        this.take(other.ws, other.t);
        this.take(server, ticket);
        this.ctx.waitUntil(this.startGame(mode, [other.t.userId, userId], [other.ws, server], agreedRule(other.t.rule ?? "hidden", rule)!, clockMin));
      }
    }
    return response;
  }

  /** 레이팅매치 대기자끼리 짝짓기(동기). 남은 대기자가 있으면 다음 확인 시각에 알람. */
  private matchRated() {
    const now = Date.now();
    const list = this.open().filter((x) => x.t.mode === "rated");
    const byKey = new Map(list.map((x) => [x.t.key, x]));
    const waiters: Waiter[] = list.map((x) => x.t);
    for (const [a, b] of pickPairs(waiters, now)) {
      const A = byKey.get(a.key)!, B = byKey.get(b.key)!;
      this.take(A.ws, A.t);
      this.take(B.ws, B.t);
      this.ctx.waitUntil(this.startGame("rated", [a.userId, b.userId], [A.ws, B.ws]));
    }
    const left = this.open().filter((x) => x.t.mode === "rated").map((x) => x.t);
    const next = nextCheck(left, now);
    if (next !== null) this.ctx.waitUntil(this.ctx.storage.setAlarm(next));
  }

  async alarm() {
    this.matchRated();
    // 15초가 지나도 사람이 없고 AI를 허용한 사람 → 실력 점수가 가장 가까운 AI 3개 중 하나
    const due = dueForAi(this.open().filter((x) => x.t.mode === "rated").map((x) => x.t), Date.now());
    if (!due.length) return;
    // 다른 사람과 대국 중인 AI는 제외(비어 있는 AI 중 가장 가까운 3개에서 고른다). 모두 바쁘면 계속 기다린다.
    const free = (await this.env.DB.prepare("SELECT * FROM users WHERE is_bot = 1 AND active_game IS NULL").all<Row>()).results;
    for (const w of due) {
      const entry = this.open().find((x) => x.t.key === w.key);
      const bot = pickBot(free, w.mmr);
      if (!entry || !bot) continue;
      free.splice(free.indexOf(bot), 1); // 이번 알람 안에서도 같은 AI를 두 번 쓰지 않게
      this.take(entry.ws, entry.t);
      await this.startGame("rated", [w.userId, bot.id], [entry.ws]);
    }
    const stillWaiting = this.open().some((x) => x.t.mode === "rated" && x.t.allowAi);
    if (stillWaiting) await this.ctx.storage.setAlarm(Date.now() + 2_000); // AI가 비기를 기다리며 다시 확인
  }

  private async startGame(mode: MatchMode, userIds: [string, string], sockets: WebSocket[], hiddenMove = true, clockMin = 3) {
    try {
      const rows = (await this.env.DB.prepare("SELECT * FROM users WHERE id IN (?, ?)").bind(...userIds).all<Row>()).results;
      const [a, b] = userIds.map((id) => rows.find((r) => r.id === id)!);
      const [black, white] = Math.random() < 0.5 ? [a, b] : [b, a];
      const gameId = crypto.randomUUID();
      const init: RoomInit = { id: gameId, mode, rated: mode === "rated", hiddenMove, clockMin, black: player(black), white: player(white) };
      const room = this.env.GAME_ROOM.get(this.env.GAME_ROOM.idFromName(gameId)) as unknown as DurableObjectStub<GameRoom>;
      await room.init(init);
      // 사람·AI 모두 "대국 중" 표시(AI는 이 표시가 있는 동안 다른 사람과 매칭되지 않는다)
      await this.env.DB.prepare("UPDATE users SET active_game = ? WHERE id IN (?, ?)").bind(gameId, a.id, b.id).run();
      for (const ws of sockets) {
        send(ws, { type: "matched", gameId });
        try { ws.close(1000, "matched"); } catch { /* */ }
      }
    } catch (e) {
      console.error("startGame", e);
      for (const ws of sockets) {
        send(ws, { type: "error", code: "match_error", message: "매칭 중 오류가 났습니다. 다시 시도해 주세요." });
        try { ws.close(1011, "error"); } catch { /* */ }
      }
    }
  }

  async webSocketMessage() { /* 대기 중에는 받을 메시지가 없다(ping 무시) */ }

  async webSocketClose(ws: WebSocket) {
    try { ws.close(); } catch { /* */ }
  }
}
