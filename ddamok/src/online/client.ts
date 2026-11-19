// 브라우저 쪽 온라인 연결: 매칭 대기 소켓과 대국 소켓(끊기면 자동 재접속).
import type { ClientMessage, GameSnapshot, MatchMode, ServerMessage } from "./protocol.ts";
import { HEARTBEAT_MS, HEARTBEAT_TIMEOUT_MS, PING, WS_PROTOCOL } from "./protocol.ts";
import type { Player } from "../game/types.ts";
import { errorText, t } from "../i18n/index.ts";

function wsUrl(path: string): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${path}`;
}

export interface MatchHandlers {
  onWaiting(): void;
  onMatched(gameId: string): void;
  onError(message: string): void;
}

/** 매칭 대기. 돌려주는 함수를 부르면 취소. */
export function findMatch(token: string, mode: MatchMode, code: string | null, h: MatchHandlers): () => void {
  const q = new URLSearchParams({ mode, ...(mode === "friend" && code ? { code } : {}) });
  const ws = new WebSocket(wsUrl(`/api/match?${q}`), [WS_PROTOCOL, token]);
  let done = false;
  const beat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(PING), HEARTBEAT_MS);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data) as ServerMessage;
    if (m.type === "waiting") h.onWaiting();
    else if (m.type === "matched") { done = true; h.onMatched(m.gameId); }
    else if (m.type === "error") { done = true; h.onError(errorText(m.code, m.message)); }
  };
  ws.onclose = () => {
    clearInterval(beat);
    if (!done) h.onError(t("err.connectionLost"));
    done = true;
  };
  return () => {
    done = true;
    clearInterval(beat);
    ws.close();
  };
}

export type ConnStatus = "connecting" | "open" | "reconnecting";

/**
 * 대국 접속. 10초마다 신호(PING)를 보내고, 서버 응답이 25초 넘게 없거나 끊기면 1~3초 간격으로 다시 접속한다
 * (끊긴 것이 서버에 알려진 뒤 45초 안에 돌아와야 패배하지 않음).
 */
export class GameConnection {
  private ws: WebSocket | null = null;
  private closed = false;
  private tries = 0;
  private lastHeard = Date.now();
  private beat: ReturnType<typeof setInterval>;
  private readonly gameId: string;
  private readonly token: string;
  private readonly onState: (you: Player, game: GameSnapshot) => void;
  private readonly onStatus: (s: ConnStatus) => void;
  private readonly onError: (message: string) => void;

  constructor(gameId: string, token: string, onState: (you: Player, game: GameSnapshot) => void, onStatus: (s: ConnStatus) => void, onError: (m: string) => void) {
    this.gameId = gameId;
    this.token = token;
    this.onState = onState;
    this.onStatus = onStatus;
    this.onError = onError;
    this.connect();
    this.beat = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(PING);
        if (Date.now() - this.lastHeard > HEARTBEAT_TIMEOUT_MS) this.ws.close(); // 응답 없는 연결 → 다시 접속
      }
    }, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  /** 앱으로 돌아오면 바로 신호를 보내 연결 상태를 확인 */
  private onVisible = () => {
    if (document.visibilityState === "visible" && this.ws?.readyState === WebSocket.OPEN) this.ws.send(PING);
  };

  private connect() {
    this.onStatus(this.tries ? "reconnecting" : "connecting");
    const ws = new WebSocket(wsUrl(`/api/games/${this.gameId}/ws`), [WS_PROTOCOL, this.token]);
    this.ws = ws;
    ws.onopen = () => { this.tries = 0; this.lastHeard = Date.now(); this.onStatus("open"); };
    ws.onmessage = (e) => {
      this.lastHeard = Date.now();
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === "state") {
        this.onState(m.you, m.game);
        if (m.game.status !== "playing") this.close();
      } else if (m.type === "error") this.onError(errorText(m.code, m.message));
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.tries++;
      this.onStatus("reconnecting");
      setTimeout(() => !this.closed && this.connect(), Math.min(3000, 1000 * this.tries));
    };
  }

  send(m: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.closed = true;
    clearInterval(this.beat);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.ws?.close();
  }
}
