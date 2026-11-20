import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canUseHidden, createGame, createHistory, currentState, DEFAULT_BOARD_SIZE, forfeitHidden, makeConfig, opponent, replayMoves, tryMove,
  undoMove, viewFor, type GameHistory, type GameState, type MoveOptions, type Player, type Position,
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
import { LookPicker } from "../components/LookPicker.tsx";
import { Chevron, Fold } from "../components/Fold.tsx";
import { levelById } from "../ai/levels.ts";
import { colorName, displayName, rankName, t, type MessageKey } from "../i18n/index.ts";
import { Rich } from "../i18n/Rich.tsx";

const BOARD_SIZES = [13, 15, 19];
/** (실험용) 흑 두 번째 수 제한 칸 수 — 빌드 시 VITE_SECOND_MOVE_MIN_DISTANCE로 켠다(기본 0 = 꺼짐) */
const SECOND_MIN = Number(import.meta.env.VITE_SECOND_MOVE_MIN_DISTANCE ?? 0) || 0;
/** 백 히든은 AI 대국에서만(같은 화면 2인 대국은 숨길 수 없다) */
/** (시험 중) 히든 대국은 흑도 10개를 따내면 승리 */
const freshGame = (size: number, hiddenMove = false) =>
  createGame(size, { secondMoveMinDistance: SECOND_MIN, hiddenMove, ...(hiddenMove ? { captureTarget: { black: 10, white: 10 } } : {}) });
/** 백 히든: 버튼을 누른 뒤 둘 때까지 주어지는 시간 */
const HIDDEN_MS = 10_000;
/** "백 히든!" 배너가 떠 있는 시간(AI는 이만큼 뒤에 둔다) */
const BANNER_MS = 1_900;
/** 대국이 끝난 뒤 승리 문구를 보여 주는 시간(그 뒤 결과 창) */
const END_BANNER_MS = 2_600;

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
  const [waiting, setWaiting] = useState<{ mode: MatchMode; code: string | null; hidden?: boolean } | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [, tick] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const aiRequest = useRef(0);
  const conn = useRef<GameConnection | null>(null);
  const cancelMatch = useRef<(() => void) | null>(null);
  // 백 히든
  const [armedUntil, setArmedUntil] = useState<number | null>(null);
  const [banner, setBanner] = useState(0);
  const [notice, setNotice] = useState<{ kind: "found" | "lost"; at: number; pos?: Position; id: number } | null>(null);

  // ── 화면에 보일 판 ─────────────────────────────
  const onlineMoves = online?.game?.moves;
  const onlineView = online?.game?.view;
  const onlineState = useMemo<GameState | null>(() => {
    // 서버가 보는 사람별 판(view)을 보내면 그대로 쓴다(백 히든: 흑에게는 숨은 돌이 없는 판)
    if (onlineView) return onlineView;
    if (!onlineMoves) return null;
    const r = replayMoves(makeConfig(online!.game!.boardSize, { secondMoveMinDistance: online!.game!.secondMoveMinDistance ?? 0 }), onlineMoves);
    return r.ok ? r.state : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMoves, onlineView]);
  const state = onlineState ?? currentState(history);
  /** 이 화면을 보는 사람의 색(AI·온라인 대국) — 숨은 돌은 백에게만 보인다 */
  const viewer: Player | null = online ? online.you ?? null : aiGame ? opponent(aiGame.aiColor) : null;
  // 온라인 판은 이미 서버가 보는 사람에 맞춰 보낸 판이다
  const shown = !online && viewer ? viewFor(state, viewer) : state;
  /** 히든을 누르고 아직 두지 않았다면 그 마감 시각(온라인은 서버가 알려 준 남은 시간 기준) */
  const armedAt = online ? (online.game?.hiddenArmedMs !== undefined ? (online.at ?? Date.now()) + online.game.hiddenArmedMs : null) : armedUntil;
  const hs = state.hidden && state.hidden.index >= 0 ? state.hidden : null;
  const onlinePlaying = !!online && (!online.game || online.game.status === "playing");
  const aiThinking = !online && aiGame !== null && !state.isFinished && state.currentPlayer === aiGame.aiColor;

  // 온라인: 새 수가 오면 포획 효과
  const lastLen = useRef(0);
  useEffect(() => {
    if (!onlineState) { lastLen.current = 0; return; }
    if (onlineState.moveCount === lastLen.current + 1 && onlineState.lastCaptured.length) {
      const by = onlineState.lastMove ? onlineState.board[onlineState.lastMove.row][onlineState.lastMove.col] : null;
      if (by) setFx({ id: onlineState.moveCount, stones: onlineState.lastCaptured, color: opponent(by) });
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
  const commit = useCallback((h: GameHistory, pos: Position, opts: MoveOptions = {}) => {
    const r = tryMove(currentState(h), pos, undefined, opts);
    if (!r.ok) return h; // 둘 수 없는 곳: 상태 변경 없음
    const next = [...h, r.state];
    const s = r.state;
    if (r.revealedHidden) {
      setNotice({ kind: "found", at: s.moveCount, pos, id: Date.now() });
      setFx(null);
      return next;
    }
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
      conn.current?.send({ type: "move", row: pos.row, col: pos.col, moveNo: g.moves.length, ...(armedAt !== null && online.you === "white" ? { hidden: true } : {}) });
      return;
    }
    if (aiThinking) return;
    if (armedUntil !== null) {
      if (!isEmptyFor(pos)) return;
      setArmedUntil(null);
      setHistory((h) => commit(h, pos, { hidden: true }));
      return;
    }
    setHistory((h) => commit(h, pos));
  }

  /** 백이 숨길 자리로 고를 수 있는 빈칸인가 */
  function isEmptyFor(pos: Position) {
    return state.board[pos.row]?.[pos.col] === null;
  }

  function startHidden() {
    if (!canUseHidden(state) || viewer !== "white" || aiThinking || armedAt !== null) return;
    if (online) {
      if (onlinePlaying) conn.current?.send({ type: "hidden" });
      return; // 배너·카운트다운은 서버 상태가 오면 띄운다
    }
    setArmedUntil(Date.now() + HIDDEN_MS);
    setBanner((b) => b + 1);
    setNotice(null);
  }

  // 히든 카운트다운 표시(온라인 포함): 남은 시간 막대를 부드럽게, 마지막 3초 진동
  useEffect(() => {
    if (armedAt === null) return;
    let last = -1;
    const timer = setInterval(() => {
      const left = Math.ceil((armedAt - Date.now()) / 1000);
      if (left !== last) { last = left; if (left <= 3 && left > 0 && viewer === "white") navigator.vibrate?.(40); }
      tick((x) => x + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [armedAt, viewer]);

  // 온라인 히든: 서버 상태가 바뀔 때 배너("백 히든!")·찾았다·기회 소멸 알림
  const prevOnline = useRef<{ armed: boolean; hiddenIndex: number | null; revealed: boolean; moveCount: number } | null>(null);
  useEffect(() => {
    if (!online?.game || !onlineState) { prevOnline.current = null; return; }
    const h = onlineState.hidden;
    const cur = { armed: online.game.hiddenArmedMs !== undefined, hiddenIndex: h ? h.index : null, revealed: !!h?.revealed, moveCount: onlineState.moveCount };
    const prev = prevOnline.current;
    if (prev) {
      if (cur.armed && !prev.armed) { setBanner((b) => b + 1); setNotice(null); }
      else if (cur.hiddenIndex !== null && cur.hiddenIndex >= 0 && prev.hiddenIndex === null && !prev.armed) setBanner((b) => b + 1); // AI 백이 바로 숨김
      if (prev.armed && !cur.armed && cur.hiddenIndex !== null && cur.hiddenIndex < 0) setNotice({ kind: "lost", at: cur.moveCount, id: Date.now() });
      if (h && h.index >= 0 && cur.revealed && !prev.revealed && cur.moveCount === prev.moveCount && onlineState.currentPlayer === "black")
        setNotice({ kind: "found", at: cur.moveCount, pos: h.pos, id: Date.now() });
    }
    prevOnline.current = cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online?.game, onlineState]);

  // 히든 시간 초과(AI 대국): 10, 9, 8 … 시간이 지나면 기회가 사라진다(백 차례 그대로). 온라인은 서버가 판정한다.
  useEffect(() => {
    if (armedUntil === null) return;
    let last = -1;
    const timer = setInterval(() => {
      const left = Math.ceil((armedUntil - Date.now()) / 1000);
      if (left !== last) last = left;
      if (left <= 0) {
        setArmedUntil(null);
        setHistory((h) => [...h.slice(0, -1), forfeitHidden(currentState(h))]);
        setNotice({ kind: "lost", at: currentState(history).moveCount, id: Date.now() });
      }
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armedUntil]);

  // AI 차례: Web Worker에서 계산(최소 0.35초)
  useEffect(() => {
    if (!aiGame || !aiThinking) return;
    const level = levelById(aiGame.levelId);
    if (!level) return;
    workerRef.current ??= new Worker(new URL("../ai/worker.ts", import.meta.url), { type: "module" });
    const id = ++aiRequest.current;
    const started = performance.now();
    const worker = workerRef.current;
    const onMessage = (e: MessageEvent<{ id: number; move: Position; hidden?: boolean }>) => {
      if (e.data.id !== id) return;
      const hidden = !!e.data.hidden;
      if (hidden) setBanner((b) => b + 1); // AI도 "백 히든!" 뒤에 둔다
      const wait = Math.max(0, (hidden ? BANNER_MS : 350) - (performance.now() - started));
      setTimeout(() => {
        if (aiRequest.current !== id) return;
        setHistory((h) => commit(h, e.data.move, { hidden }));
      }, wait);
    };
    worker.addEventListener("message", onMessage);
    // 흑 AI는 흑에게 보이는 판만 받는다(숨은 돌을 모른다)
    worker.postMessage({ id, state: viewFor(state, aiGame.aiColor), levelId: level.id });
    return () => {
      worker.removeEventListener("message", onMessage);
      aiRequest.current++;
    };
  }, [aiGame, aiThinking, state, commit]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const reset = useCallback((size: number, hiddenMove = false) => {
    setHistory(createHistory(freshGame(size, hiddenMove)));
    setFx(null);
    setResultOpen(true);
    setArmedUntil(null);
    setNotice(null);
  }, []);

  function undo() {
    if (online) return;
    setArmedUntil(null);
    setNotice(null);
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
    reset(boardSize, !!aiGame);
  }

  function resign() {
    if (online && onlinePlaying && window.confirm(t("confirm.resign"))) conn.current?.send({ type: "resign" });
  }

  function find(mode: MatchMode, code: string | null, hidden = true) {
    if (!session) return;
    setOnlineError(null);
    cancelMatch.current?.();
    setWaiting({ mode, code, hidden });
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
    }, hidden);
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
  else if (armedAt !== null) status = t(viewer === "white" ? "hidden.armed" : "hidden.opponentArmed");
  else if (notice?.kind === "found" && notice.at === state.moveCount && state.currentPlayer === "black") status = t("hidden.foundStatus");
  else if (notice?.kind === "lost" && notice.at === state.moveCount) status = t("hidden.lost");
  else if (aiThinking) status = `${t("status.aiThinking")} · ${moveNo}`;
  else status = `${t("status.turn", { color: colorName(state.currentPlayer) })} · ${moveNo}`;
  if (!state.isFinished && viewer === "black" && hs && !hs.revealed && armedAt === null) status += ` · ${t("hidden.lurking")}`;

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

  // 대국이 끝나면 먼저 판 위에 "백, 23수 끝 / 오목 승!"을 크게 띄우고, 결과 창은 조금 뒤에
  const endKey = result ? `${online?.gameId ?? "local"}-${result.moveCount}-${result.winner}-${result.reason}` : null;
  const [cardKey, setCardKey] = useState<string | null>(null);
  useEffect(() => {
    if (!endKey) { setCardKey(null); return; }
    const timer = setTimeout(() => setCardKey(endKey), END_BANNER_MS);
    return () => clearTimeout(timer);
  }, [endKey]);

  const canUndo = !online && history.length > 1 && !(aiGame && history.length === 2 && aiGame.aiColor === "black");
  const boardLocked = aiThinking || (!!online && (!online.game || online.game.status !== "playing" || state.currentPlayer !== online.you));

  return (
    <main className="layout">
      <section className="play">
        <Scoreboard state={shown} names={{ black: seatLabel("black"), white: seatLabel("white") }} />
        <div className={`board-wrap${armedAt !== null ? " hidden-armed" : ""}`}>
          <Board
            state={shown}
            onPlay={play}
            fx={fx}
            disabled={boardLocked}
            ghost={viewer === "white" && hs && !hs.revealed ? hs.pos : null}
            reveal={hs?.revealed && state.board[hs.pos.row]?.[hs.pos.col] === "white" ? hs.pos : null}
            found={notice?.kind === "found" && notice.pos ? { pos: notice.pos, id: notice.id } : null}
          />
          {banner > 0 && (
            <div key={banner} className="hidden-banner" aria-hidden><span>{t("hidden.banner")}</span></div>
          )}
          {result && cardKey !== endKey && (
            <div key={endKey} className="end-banner" aria-hidden>
              <span className="end-line1">{result.winner ? t("end.line1", { color: colorName(result.winner), n: result.moveCount }) : t("end.drawLine1", { n: result.moveCount })}</span>
              <span className={`end-line2 ${result.winner ?? "draw"}`}>{t(`end.${result.winner ? result.reason : "draw"}` as MessageKey)}</span>
            </div>
          )}
          {result && resultOpen && cardKey === endKey && (
            <GameResult result={result} canUndo={canUndo} onNewGame={newGame} onUndo={undo} onClose={() => setResultOpen(false)} />
          )}
        </div>
        {armedAt !== null && (() => {
          // 히든 카운트다운: 판을 가리지 않게 바둑판 바로 아래에
          const msLeft = Math.max(0, armedAt - Date.now());
          const left = Math.ceil(msLeft / 1000);
          return (
            <div className={`hidden-timer${left <= 3 ? " urgent" : ""}`} aria-hidden>
              <span key={left} className="hidden-timer-n">{left}</span>
              <span className="hidden-timer-bar"><i style={{ width: `${(msLeft / HIDDEN_MS) * 100}%` }} /></span>
            </div>
          );
        })()}
        <div className="controls">
          <p className={`status ${state.isFinished ? "done" : state.currentPlayer}`} aria-live="polite">
            <span className={`dot ${online?.game?.result ? online.game.result.winner ?? "" : state.isFinished ? state.winner ?? "" : state.currentPlayer}`} aria-hidden /> {status}
          </p>
          <div className="buttons">
            {online ? (
              onlinePlaying ? (
                <>
                  {viewer === "white" && canUseHidden(state) && armedAt === null && state.currentPlayer === "white" && (
                    <button className="btn hidden-btn" onClick={startHidden}>{t("btn.hidden")}</button>
                  )}
                  <button className="btn" onClick={resign} disabled={!online.game}>{t("btn.resign")}</button>
                </>
              ) : <button className="btn primary" onClick={newGame}>{t("btn.newGame")}</button>
            ) : (
              <>
                {viewer === "white" && canUseHidden(state) && armedAt === null && (
                  <button className="btn hidden-btn" onClick={startHidden} disabled={aiThinking}>{t("btn.hidden")}</button>
                )}
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
              {online.game && <> {t(online.game.hiddenMove ? "online.hiddenOn" : "online.hiddenOff")}</>}
            </p>
          </section>
        ) : (
          <>
            {session?.verified ? (
              <section className="panel" aria-label={t("nav.profile")}>
                <div className="me">
                  <a href="/profile" className="me-name">{session.user.username}</a>
                  <span className="score-rank">{rankName(session.user.rating)}</span>
                  <span className="seat-rating">{t("points", { rating: formatRating(session.user.rating, session.user.provisional) })}</span>
                </div>
              </section>
            ) : (
              // 인증 코드를 기다리는 중이면 펼쳐 둔다
              <Fold id="login" title={t(session ? "account.verifyTitle" : "account.login")} label={t("nav.profile")} forceOpen={!!session}>
                <AuthBox session={session} onSession={setSess} />
              </Fold>
            )}
            <OnlinePanel session={session} waiting={waiting} error={onlineError} onFind={find} onCancel={cancelFind} />
            <AiPanel
              active={aiGame}
              onStart={(levelId, humanColor) => {
                setAiGame({ levelId, aiColor: opponent(humanColor) });
                reset(boardSize, true);
              }}
              onStop={() => {
                setAiGame(null);
                reset(boardSize);
              }}
            />
            <Fold id="size" title={t("size.label")}>
              <label className="size-picker">
                <select
                  aria-label={t("size.label")}
                  value={boardSize}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    if (state.moveCount > 0 && !state.isFinished && !window.confirm(t("confirm.size"))) return;
                    setBoardSize(size);
                    reset(size, !!aiGame);
                  }}
                >
                  {BOARD_SIZES.map((s) => (
                    <option key={s} value={s}>{s}×{s}{s === DEFAULT_BOARD_SIZE ? t("size.default") : ""}</option>
                  ))}
                </select>
              </label>
              <p className="muted small-note">{t("size.note")}</p>
            </Fold>
            <Leaderboard />
          </>
        )}
        <LookPicker />
        <details className="panel rules">
          <summary>{t("rules.title")}<Chevron /></summary>
          <ul>
            {(["rules.1", "rules.2", "rules.3", "rules.4", "rules.5", "rules.6", "rules.7"] as const).map((k) => <li key={k}><Rich text={t(k)} /></li>)}
          </ul>
        </details>
      </aside>
    </main>
  );
}
