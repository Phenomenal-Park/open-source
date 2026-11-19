// 브라우저 쪽 온라인 연결: 매칭 대기 소켓과 대국 소켓(끊기면 자동 재접속).
import type { ClientMessage, GameSnapshot, MatchMode, ServerMessage } from "./protocol.ts";
import { WS_PROTOCOL } from "./protocol.ts";
import type { Player } from "../game/types.ts";

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
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data) as ServerMessage;
    if (m.type === "waiting") h.onWaiting();
    else if (m.type === "matched") { done = true; h.onMatched(m.gameId); }
    else if (m.type === "error") { done = true; h.onError(m.message); }
  };
  ws.onclose = () => {
    if (!done) h.onError("연결이 끊겼습니다. 이메일 인증·로그인 상태를 확인하고 다시 시도해 주세요.");
    done = true;
  };
  return () => {
    done = true;
    ws.close();
  };
}

export type ConnStatus = "connecting" | "open" | "reconnecting";

/** 대국 접속. 끊기면 1~3초 간격으로 다시 접속한다(45초 안에 돌아와야 패배하지 않음). */
export class GameConnection {
  private ws: WebSocket | null = null;
  private closed = false;
  private tries = 0;
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
  }

  private connect() {
    this.onStatus(this.tries ? "reconnecting" : "connecting");
    const ws = new WebSocket(wsUrl(`/api/games/${this.gameId}/ws`), [WS_PROTOCOL, this.token]);
    this.ws = ws;
    ws.onopen = () => { this.tries = 0; this.onStatus("open"); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMessage;
      if (m.type === "state") {
        this.onState(m.you, m.game);
        if (m.game.status !== "playing") this.close();
      } else if (m.type === "error") this.onError(m.message);
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
    this.ws?.close();
  }
}
