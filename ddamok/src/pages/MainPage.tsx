import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createGame, createHistory, currentState, DEFAULT_BOARD_SIZE, makeConfig, opponent, playMove, replayMoves, undoMove,
  type GameHistory, type GameState, type Player, type Position,
} from "../game/index.ts";
import { api, ApiError, loadSession, saveSession, type Session } from "../api.ts";
import { formatRating, type GameSnapshot, type MatchMode } from "../online/protocol.ts";
import { findMatch, GameConnection, type ConnStatus } from "../online/client.ts";
import { Board, type CaptureFx } from "../components/Board.tsx";
import { Scoreboard, type SeatLabel } from "../components/Scoreboard.tsx";
import { GameResult, type ResultView } from "../components/GameResult.tsx";
import { AiPanel } from "../components/AiPanel.tsx";
import { AuthBox } from "../components/AuthBox.tsx";
import { OnlinePanel } from "../components/OnlinePanel.tsx";
import { Leaderboard } from "../components/Leaderboard.tsx";
import { levelById } from "../ai/levels.ts";
import { colorName, displayName, rankName, t, type MessageKey } from "../i18n/index.ts";
import { Rich } from "../i18n/Rich.tsx";

const BOARD_SIZES = [13, 15, 19];
/** (실험용) 흑 두 번째 수 제한 칸 수 — 빌드 시 VITE_SECOND_MOVE_MIN_DISTANCE로 켠다(기본 0 = 꺼짐) */
const SECOND_MIN = Number(import.meta.env.VITE_SECOND_MOVE_MIN_DISTANCE ?? 0) || 0;
const freshGame = (size: number) => createGame(size, { secondMoveMinDistance: SECOND_MIN });

interface Online {
  gameId: string;
  status: ConnStatus;
  you?: Player;
  game?: GameSnapshot;
  /** 상태를 받은 시각(접속 끊김 카운트다운용) */
  at?: number;
}

export function MainPage() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [boardSize, setBoardSize] = useState(DEFAULT_BOARD_SIZE);
  const [history, setHistory] = useState<GameHistory>(() => createHistory(freshGame(DEFAULT_BOARD_SIZE)));
  const [fx, setFx] = useState<CaptureFx | null>(null);
  const [resultOpen, setResultOpen] = useState(true);
  const [aiGame, setAiGame] = useState<{ levelId: string; aiColor: Player } | null>(null);
  const [online, setOnline] = useState<Online | null>(null);
  const [waiting, setWaiting] = useState<{ mode: MatchMode; code: string | null } | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [, tick] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const aiRequest = useRef(0);
  const conn = useRef<GameConnection | null>(null);
  const cancelMatch = useRef<(() => void) | null>(null);

  // ── 화면에 보일 판 ─────────────────────────────
  const onlineMoves = online?.game?.moves;
  const onlineState = useMemo<GameState | null>(() => {
    if (!onlineMoves) return null;
    const r = replayMoves(makeConfig(online!.game!.boardSize, { secondMoveMinDistance: online!.game!.secondMoveMinDistance ?? 0 }), onlineMoves);
    return r.ok ? r.state : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMoves]);
  const state = onlineState ?? currentState(history);
  const onlinePlaying = !!online && (!online.game || online.game.status === "playing");
  const aiThinking = !online && aiGame !== null && !state.isFinished && state.currentPlayer === aiGame.aiColor;

  // 온라인: 새 수가 오면 포획 효과
  const lastLen = useRef(0);
  useEffect(() => {
    if (!onlineState) { lastLen.current = 0; return; }
    if (onlineState.moveCount === lastLen.current + 1 && onlineState.lastCaptured.length) {
      const by = onlineState.board[onlineState.lastMove!.row][onlineState.lastMove!.col]!;
      setFx({ id: onlineState.moveCount, stones: onlineState.lastCaptured, color: opponent(by) });
    } else if (onlineState.moveCount !== lastLen.current) setFx(null);
    if (onlineState.moveCount !== lastLen.current) setResultOpen(true);
    lastLen.current = onlineState.moveCount;
  }, [onlineState]);

  // 접속 끊김 카운트다운 표시용 1초 타이머
  const anyDisconnected = online?.game && Object.keys(online.game.disconnected).length > 0;
  useEffect(() => {
    if (!anyDisconnected) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [anyDisconnected]);

  const setSess = useCallback((s: Session | null) => {
    saveSession(s);
    setSession(s);
  }, []);

  const joinGame = useCallback((gameId: string, token: string) => {
    conn.current?.close();
    setWaiting(null);
    setAiGame(null);
    setFx(null);
    setResultOpen(true);
    lastLen.current = 0;
    setOnline({ gameId, status: "connecting" });
    conn.current = new GameConnection(
      gameId, token,
      (you, game) => setOnline((o) => (o && o.gameId === gameId ? { ...o, you, game, at: Date.now() } : o)),
      (status) => setOnline((o) => (o && o.gameId === gameId ? { ...o, status } : o)),
      (message) => setOnlineError(message),
    );
  }, []);

  // 저장된 로그인 확인 + 진행 중인 대국이 있으면 다시 접속
  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    api.me(s.token).then(
      (me) => {
        setSess({ token: s.token, user: me.user, verified: me.verified });
        if (me.activeGame) joinGame(me.activeGame, s.token);
      },
      (e) => { if (e instanceof ApiError && e.status === 401) setSess(null); },
    );
    return () => { conn.current?.close(); cancelMatch.current?.(); };
  }, [setSess, joinGame]);

  // 온라인 대국이 끝나면 내 점수 새로 받기
  const finished = online?.game?.status === "finished";
  useEffect(() => {
    if (!finished || !session) return;
    api.me(session.token).then((me) => setSess({ token: session.token, user: me.user, verified: me.verified }), () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // ── 로컬·AI ─────────────────────────────
  const commit = useCallback((h: GameHistory, pos: Position) => {
    const next = playMove(h, pos);
    if (next === h) return h; // 둘 수 없는 곳: 상태 변경 없음
    const s = currentState(next);
    if (s.lastCaptured.length) setFx({ id: s.moveCount, stones: s.lastCaptured, color: opponent(s.board[pos.row][pos.col]!) });
    else setFx(null);
    setResultOpen(true);
    return next;
  }, []);

  function play(pos: Position) {
    if (online) {
      const g = online.game;
      if (!g || g.status !== "playing" || !onlineState || onlineState.currentPlayer !== online.you) return;
      if (onlineState.board[pos.row]?.[pos.col] !== null) return;
      conn.current?.send({ type: "move", row: pos.row, col: pos.col, moveNo: g.moves.length });
      return;
    }
    if (aiThinking) return;
    setHistory((h) => commit(h, pos));
  }

  // AI 차례: Web Worker에서 계산(최소 0.35초)
  useEffect(() => {
    if (!aiGame || !aiThinking) return;
    const level = levelById(aiGame.levelId);
    if (!level) return;
    workerRef.current ??= new Worker(new URL("../ai/worker.ts", import.meta.url), { type: "module" });
    const id = ++aiRequest.current;
    const started = performance.now();
    const worker = workerRef.current;
    const onMessage = (e: MessageEvent<{ id: number; move: Position }>) => {
      if (e.data.id !== id) return;
      const wait = Math.max(0, 350 - (performance.now() - started));
      setTimeout(() => {
        if (aiRequest.current !== id) return;
        setHistory((h) => commit(h, e.data.move));
      }, wait);
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, state, levelId: level.id });
    return () => {
      worker.removeEventListener("message", onMessage);
      aiRequest.current++;
    };
  }, [aiGame, aiThinking, state, commit]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const reset = useCallback((size: number) => {
    setHistory(createHistory(freshGame(size)));
    setFx(null);
    setResultOpen(true);
  }, []);

  function undo() {
    if (online) return;
    setHistory((h) => {
      if (!aiGame) return undoMove(h);
      let next = undoMove(h);
      while (next.length > 1 && currentState(next).currentPlayer === aiGame.aiColor) next = undoMove(next);
      return next;
    });
    setFx(null);
  }

  function leaveOnline() {
    conn.current?.close();
    conn.current = null;
    setOnline(null);
    setOnlineError(null);
  }

  function newGame() {
    if (online) {
      if (onlinePlaying) return;
      leaveOnline();
    }
    reset(boardSize);
  }

  function resign() {
    if (online && onlinePlaying && window.confirm(t("confirm.resign"))) conn.current?.send({ type: "resign" });
  }

  function find(mode: MatchMode, code: string | null) {
    if (!session) return;
    setOnlineError(null);
    cancelMatch.current?.();
    setWaiting({ mode, code });
    cancelMatch.current = findMatch(session.token, mode, code, {
      onWaiting: () => undefined,
      onMatched: (gameId) => {
        cancelMatch.current = null;
        joinGame(gameId, session.token);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      onError: (message) => {
        cancelMatch.current = null;
        setWaiting(null);
        setOnlineError(message);
      },
    });
  }

  function cancelFind() {
    cancelMatch.current?.();
    cancelMatch.current = null;
    setWaiting(null);
  }

  // ── 표시 ─────────────────────────────
  const aiLevel = aiGame ? levelById(aiGame.levelId) : undefined;
  const seatLabel = (p: Player): SeatLabel | null => {
    if (online?.game) {
      const pl = online.game.players[p];
      const left = online.game.disconnected[p];
      return {
        name: `${displayName(pl.username)}${online.you === p ? t("name.meSuffix") : ""}`,
        rank: rankName(pl.rating),
        rating: formatRating(pl.rating, pl.provisional),
        disconnectedSec: left !== undefined ? Math.max(0, Math.ceil((left - (Date.now() - (online.at ?? Date.now()))) / 1000)) : undefined,
      };
    }
    if (aiGame && aiLevel) return aiGame.aiColor === p ? { name: t(`ai.name.${aiLevel.id}` as MessageKey) } : { name: t("name.me") };
    return null;
  };

  const moveNo = state.moveCount === 0 && state.config.firstMoveCenter ? t("status.firstCenter")
    : state.moveCount === 2 && state.config.secondMoveMinDistance === 3 && !state.isFinished ? t("status.secondFar")
      : t("status.moveNo", { n: state.moveCount + 1 });
  let status: string;
  if (online && !online.game) status = t("status.connecting");
  else if (online?.game?.status === "aborted") status = t("status.aborted");
  else if (online?.game?.result) status = online.game.result.winner ? t("status.wins", { color: colorName(online.game.result.winner) }) : t("status.draw");
  else if (state.isFinished) status = state.winner ? t("status.winsBy", { color: colorName(state.winner), reason: t(`reason.${state.winReason!}`) }) : t("status.draw");
  else if (online) status = `${t(state.currentPlayer === online.you ? "status.myTurn" : "status.theirTurn")} · ${moveNo}${online.status === "reconnecting" ? ` · ${t("status.reconnecting")}` : ""}`;
  else if (aiThinking) status = `${t("status.aiThinking")} · ${moveNo}`;
  else status = `${t("status.turn", { color: colorName(state.currentPlayer) })} · ${moveNo}`;

  let result: ResultView | null = null;
  if (online?.game?.result && onlineState) {
    const r = online.game.result;
    result = {
      winner: r.winner, reason: r.reason, moveCount: onlineState.moveCount,
      captured: r.winner === "black" ? onlineState.capturedByBlack : onlineState.capturedByWhite,
      names: { black: online.game.players.black.username, white: online.game.players.white.username },
      ratings: r.ratings, upset: r.upset, you: online.you,
    };
  } else if (!online && state.isFinished && state.winReason) {
    result = {
      winner: state.winner, reason: state.winReason, moveCount: state.moveCount,
      captured: state.winner === "black" ? state.capturedByBlack : state.capturedByWhite,
    };
  }

  const canUndo = !online && history.length > 1 && !(aiGame && history.length === 2 && aiGame.aiColor === "black");
  const boardLocked = aiThinking || (!!online && (!online.game || online.game.status !== "playing" || state.currentPlayer !== online.you));

  return (
    <main className="layout">
      <section className="play">
        <Scoreboard state={state} names={{ black: seatLabel("black"), white: seatLabel("white") }} />
        <div className="board-wrap">
          <Board state={state} onPlay={play} fx={fx} disabled={boardLocked} />
          {result && resultOpen && (
            <GameResult result={result} canUndo={canUndo} onNewGame={newGame} onUndo={undo} onClose={() => setResultOpen(false)} />
          )}
        </div>
        <div className="controls">
          <p className={`status ${state.isFinished ? "done" : state.currentPlayer}`} aria-live="polite">
            <span className={`dot ${online?.game?.result ? online.game.result.winner ?? "" : state.isFinished ? state.winner ?? "" : state.currentPlayer}`} aria-hidden /> {status}
          </p>
          <div className="buttons">
            {online ? (
              onlinePlaying ? <button className="btn" onClick={resign} disabled={!online.game}>{t("btn.resign")}</button>
                : <button className="btn primary" onClick={newGame}>{t("btn.newGame")}</button>
            ) : (
              <>
                <button className="btn" onClick={undo} disabled={!canUndo}>{t("btn.undo")}</button>
                <button className="btn primary" onClick={newGame}>{t("btn.newGame")}</button>
              </>
            )}
          </div>
        </div>
        {onlineError && online && <p className="form-error">{onlineError}</p>}
      </section>

      <aside className="side">
        {online ? (
          <section className="panel">
            <h2>{online.game ? t(`mode.${online.game.mode}`) : t("online.title")}</h2>
            <p className="muted">
              {t(online.game?.rated ? "online.ratedNote" : "online.unratedNote")} {t("online.rulesNote")}
            </p>
          </section>
        ) : (
          <>
            <section className="panel" aria-label={t("nav.profile")}>
              {session?.verified ? (
                <div className="me">
                  <a href="/profile" className="me-name">{session.user.username}</a>
                  <span className="score-rank">{rankName(session.user.rating)}</span>
                  <span className="seat-rating">{t("points", { rating: formatRating(session.user.rating, session.user.provisional) })}</span>
                </div>
              ) : (
                <>
                  <h2>{t(session ? "account.verifyTitle" : "account.login")}</h2>
                  <AuthBox session={session} onSession={setSess} />
                </>
              )}
            </section>
            <OnlinePanel session={session} waiting={waiting} error={onlineError} onFind={find} onCancel={cancelFind} />
            <AiPanel
              active={aiGame}
              onStart={(levelId, humanColor) => {
                setAiGame({ levelId, aiColor: opponent(humanColor) });
                reset(boardSize);
              }}
              onStop={() => {
                setAiGame(null);
                reset(boardSize);
              }}
            />
            <section className="panel">
              <label className="size-picker">
                {t("size.label")}
                <select
                  value={boardSize}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    if (state.moveCount > 0 && !state.isFinished && !window.confirm(t("confirm.size"))) return;
                    setBoardSize(size);
                    reset(size);
                  }}
                >
                  {BOARD_SIZES.map((s) => (
                    <option key={s} value={s}>{s}×{s}{s === DEFAULT_BOARD_SIZE ? t("size.default") : ""}</option>
                  ))}
                </select>
              </label>
              <p className="muted small-note">{t("size.note")}</p>
            </section>
            <Leaderboard />
          </>
        )}
        <details className="panel rules">
          <summary>{t("rules.title")}</summary>
          <ul>
            {(["rules.1", "rules.2", "rules.3", "rules.4", "rules.5"] as const).map((k) => <li key={k}><Rich text={t(k)} /></li>)}
          </ul>
        </details>
      </aside>
    </main>
  );
}
