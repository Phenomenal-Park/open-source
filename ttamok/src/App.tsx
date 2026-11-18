import { useCallback, useEffect, useState } from "react";
import {
  createGame, createHistory, currentState, DEFAULT_BOARD_SIZE, opponent, playMove, undoMove,
  type GameHistory, type Player, type Position,
} from "./game/index.ts";
import { api, ApiError, type RatedResult, type Session } from "./api.ts";
import { Board, type CaptureFx } from "./components/Board.tsx";
import { Scoreboard } from "./components/Scoreboard.tsx";
import { GameResult } from "./components/GameResult.tsx";
import { AccountPanel } from "./components/AccountPanel.tsx";

const BOARD_SIZES = [13, 15, 19];
const LABEL: Record<Player, string> = { black: "흑", white: "백" };

type Rated =
  | { gameId: string; status: "playing" }
  | { gameId: string; status: "submitting" }
  | { gameId: string; status: "done"; result: RatedResult }
  | { gameId: string; status: "error"; error: string };

function loadSeat(p: Player): Session | null {
  try {
    const raw = localStorage.getItem(`ttamok.seat.${p}`);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSeat(p: Player, s: Session | null) {
  try {
    if (s) localStorage.setItem(`ttamok.seat.${p}`, JSON.stringify(s));
    else localStorage.removeItem(`ttamok.seat.${p}`);
  } catch {
    /* 저장소를 못 써도 게임은 그대로 */
  }
}

export default function App() {
  const [boardSize, setBoardSize] = useState(DEFAULT_BOARD_SIZE);
  const [history, setHistory] = useState<GameHistory>(() => createHistory(createGame(DEFAULT_BOARD_SIZE)));
  const [fx, setFx] = useState<CaptureFx | null>(null);
  const [resultOpen, setResultOpen] = useState(true);
  const [seats, setSeats] = useState<Record<Player, Session | null>>(() => ({ black: loadSeat("black"), white: loadSeat("white") }));
  const [rated, setRated] = useState<Rated | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const state = currentState(history);
  const ratedActive = rated !== null && rated.status === "playing";

  const setSeat = useCallback((p: Player, s: Session | null) => {
    setSeats((prev) => ({ ...prev, [p]: s }));
    saveSeat(p, s);
  }, []);

  // 저장된 로그인이 아직 유효한지 확인하고 점수를 새로 받아온다
  useEffect(() => {
    for (const p of ["black", "white"] as const) {
      const s = loadSeat(p);
      if (!s) continue;
      api.me(s.token).then(
        (r) => setSeat(p, { token: s.token, user: r.user }),
        (e) => { if (e instanceof ApiError && !/연결/.test(e.message)) setSeat(p, null); },
      );
    }
  }, [setSeat]);

  const reset = useCallback((size: number) => {
    setHistory(createHistory(createGame(size)));
    setFx(null);
    setResultOpen(true);
  }, []);

  function play(pos: Position) {
    if (rated && rated.status !== "playing") return; // 결과가 반영된 랭크 대국은 더 둘 수 없음
    const next = playMove(history, pos);
    if (next === history) return; // 둘 수 없는 곳: 상태 변경 없음
    const s = currentState(next);
    if (s.lastCaptured.length) setFx({ id: s.moveCount, stones: s.lastCaptured, color: opponent(s.board[pos.row][pos.col]!) });
    else setFx(null);
    setHistory(next);
    setResultOpen(true);
  }

  function undo() {
    if (ratedActive || rated?.status === "done") return;
    setHistory((h) => undoMove(h));
    setFx(null);
  }

  function newGame() {
    if (ratedActive && state.moveCount > 0 && !state.isFinished) {
      if (!window.confirm("진행 중인 랭크 대국을 그만둘까요? (점수는 바뀌지 않습니다)")) return;
    }
    setRated(null);
    reset(boardSize);
  }

  async function startRated() {
    if (!seats.black || !seats.white) return;
    setStartError(null);
    try {
      const r = await api.startRated(seats.black.token, seats.white.token);
      setRated({ gameId: r.gameId, status: "playing" });
      reset(r.boardSize);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "오류가 났습니다.");
    }
  }

  // 랭크 대국이 끝나면 기보를 제출(서버가 다시 둬서 검증)
  useEffect(() => {
    if (!rated || rated.status !== "playing" || !state.isFinished) return;
    const token = seats.black?.token ?? seats.white?.token;
    if (!token) return;
    const { gameId } = rated;
    setRated({ gameId, status: "submitting" });
    api.submitRated(gameId, state.moves, token).then(
      (result) => {
        setRated({ gameId, status: "done", result });
        setSeats((prev) => {
          const next = { ...prev };
          for (const p of ["black", "white"] as const) {
            if (next[p]) next[p] = { token: next[p]!.token, user: result[p].user };
            saveSeat(p, next[p]);
          }
          return next;
        });
      },
      (e) => setRated({ gameId, status: "error", error: e instanceof Error ? e.message : "점수 반영 실패" }),
    );
  }, [rated, state.isFinished, state.moves, seats.black?.token, seats.white?.token]);

  const canUndo = history.length > 1 && !rated;
  const status = state.isFinished
    ? `${LABEL[state.winner!]} 승리 · ${state.winReason === "capture" ? "따내기" : "오목"}`
    : `${LABEL[state.currentPlayer]} 차례 · ${state.moveCount + 1}수째`;

  return (
    <div className="app">
      <header className="app-header">
        <h1>따목</h1>
        <p className="tagline">오목 + 두 점 따내기 · 흑 12개 / 백 10개를 먼저 따내도 승리</p>
      </header>

      <main className="layout">
        <section className="play">
          <Scoreboard state={state} names={{ black: seats.black?.user ?? null, white: seats.white?.user ?? null }} />
          <div className="board-wrap">
            <Board state={state} onPlay={play} fx={fx} disabled={rated !== null && rated.status !== "playing"} />
            {state.isFinished && resultOpen && (
              <GameResult
                state={state}
                rated={rated && rated.status !== "playing" ? rated : null}
                canUndo={canUndo}
                onNewGame={newGame}
                onUndo={undo}
                onClose={() => setResultOpen(false)}
              />
            )}
          </div>
          <div className="controls">
            <p className={`status ${state.isFinished ? "done" : state.currentPlayer}`} aria-live="polite">
              <span className={`dot ${state.isFinished ? state.winner : state.currentPlayer}`} aria-hidden /> {status}
            </p>
            <div className="buttons">
              <button className="btn" onClick={undo} disabled={!canUndo}>무르기</button>
              <button className="btn primary" onClick={newGame}>새 대국</button>
            </div>
          </div>
        </section>

        <aside className="side">
          {!rated && (
            <section className="panel">
              <label className="size-picker">
                판 크기
                <select
                  value={boardSize}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    if (state.moveCount > 0 && !state.isFinished && !window.confirm("판 크기를 바꾸면 새 대국이 시작됩니다.")) return;
                    setBoardSize(size);
                    reset(size);
                  }}
                >
                  {BOARD_SIZES.map((s) => (
                    <option key={s} value={s}>{s}×{s}{s === DEFAULT_BOARD_SIZE ? " (기본)" : ""}</option>
                  ))}
                </select>
              </label>
            </section>
          )}
          <AccountPanel
            seats={seats}
            onSeat={setSeat}
            onSwap={() => {
              setSeats((prev) => {
                saveSeat("black", prev.white);
                saveSeat("white", prev.black);
                return { black: prev.white, white: prev.black };
              });
            }}
            onStartRated={startRated}
            ratedActive={ratedActive}
            startError={startError}
          />
          <details className="panel rules">
            <summary>규칙</summary>
            <ul>
              <li>흑부터 번갈아 빈 교차점에 한 점씩 둡니다. 금수(33·44·장목)는 없습니다.</li>
              <li>가로·세로·대각선으로 <b>정확히 5개</b>를 이으면 승리. 6목 이상은 둘 수 있지만 승리가 아닙니다.</li>
              <li>방금 둔 돌과 내 돌 사이에 상대 돌 <b>두 개</b>를 끼우면 따냅니다(8방향, 여러 방향 동시 가능).</li>
              <li>스스로 끼어 들어간 돌(자충)은 따이지 않습니다.</li>
              <li>흑은 <b>12개</b>, 백은 <b>10개</b>를 따내면 승리.</li>
            </ul>
          </details>
        </aside>
      </main>
    </div>
  );
}
