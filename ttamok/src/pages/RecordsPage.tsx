import { useEffect, useMemo, useState } from "react";
import { api, type GameRecord, type PublicUser, type RecordSummary } from "../api.ts";
import { makeConfig, replayMoves, type Player } from "../game/index.ts";
import { formatRating, type ResultReason } from "../online/protocol.ts";
import { Board } from "../components/Board.tsx";
import { Scoreboard } from "../components/Scoreboard.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";

const MODE = { rated: "레이팅", casual: "친선", friend: "친구" } as const;
const REASON: Record<ResultReason, string> = { five: "오목", capture: "따내기", resign: "기권", disconnect: "연결 끊김" };
const LABEL: Record<Player, string> = { black: "흑", white: "백" };

function when(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Viewer({ id }: { id: string }) {
  const [g, setG] = useState<GameRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    api.game(id).then((r) => { setG(r); setStep(r.moves.length); }, (e) => setError(e.message));
  }, [id]);
  const state = useMemo(() => {
    if (!g) return null;
    const r = replayMoves(makeConfig(15), g.moves.slice(0, step));
    return r.ok ? r.state : null;
  }, [g, step]);
  if (error) return <p className="form-error">{error}</p>;
  if (!g || !state) return <p className="muted">불러오는 중…</p>;
  const n = g.moves.length;
  return (
    <section className="viewer">
      <p className="viewer-title">
        {MODE[g.mode]} · {LABEL[g.winner]} 승({REASON[g.reason]}) · {when(g.finishedAt)}
      </p>
      <Scoreboard state={state} names={{ black: { name: g.players.black.username }, white: { name: g.players.white.username } }} />
      <div className="board-wrap">
        <Board state={state} onPlay={() => undefined} disabled fx={null} />
      </div>
      <div className="viewer-controls">
        <button className="btn small" onClick={() => setStep(0)} disabled={step === 0} aria-label="처음">⏮</button>
        <button className="btn small" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label="이전 수">◀</button>
        <span className="step">{step} / {n}수</span>
        <button className="btn small" onClick={() => setStep((s) => Math.min(n, s + 1))} disabled={step === n} aria-label="다음 수">▶</button>
        <button className="btn small" onClick={() => setStep(n)} disabled={step === n} aria-label="끝">⏭</button>
      </div>
      <input className="step-range" type="range" min={0} max={n} value={step} onChange={(e) => setStep(Number(e.target.value))} aria-label="수순" />
    </section>
  );
}

export function RecordsPage() {
  const params = new URLSearchParams(location.search);
  const user = params.get("user") ?? "";
  const gameId = params.get("game");
  const [data, setData] = useState<{ user: PublicUser; games: RecordSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.records(user).then(setData, (e) => setError(e.message));
  }, [user]);

  return (
    <main className="page">
      <form className="panel search" method="get" action="/records">
        <input name="user" aria-label="닉네임" placeholder="닉네임으로 기보 찾기" defaultValue={user} maxLength={20} required />
        <button className="btn primary" type="submit">찾기</button>
      </form>
      {gameId && <Viewer id={gameId} />}
      {error && <p className="form-error">{error}</p>}
      {data && (
        <section className="panel records">
          <h2>
            {data.user.username} <span className="score-rank">{data.user.rank}</span>{" "}
            <span className="seat-rating">{formatRating(data.user.rating, data.user.provisional)}점</span>
          </h2>
          <p className="muted">최근 {data.games.length}판 (최대 100판까지 보관)</p>
          {data.games.length === 0 ? <p className="muted">기보가 없습니다.</p> : (
            <ol className="record-list">
              {data.games.map((g) => {
                const d = g.ratingAfter !== null && g.ratingBefore !== null ? g.ratingAfter - g.ratingBefore : null;
                return (
                  <li key={g.id} className={g.id === gameId ? "current" : ""}>
                    <a href={`/records?user=${encodeURIComponent(data.user.username)}&game=${g.id}`}>
                      <span className={`wl ${g.won ? "win" : "loss"}`}>{g.won ? "승" : "패"}</span>
                      <span className={`dot ${g.color}`} aria-label={LABEL[g.color]} />
                      <span className="who">{g.opponent ?? "?"}</span>
                      <span className="meta">{MODE[g.mode]} · {REASON[g.reason]} · {g.moveCount}수</span>
                      <span className={`delta ${d && d > 0 ? "up" : d && d < 0 ? "down" : ""}`}>{d === null ? "" : d > 0 ? `+${d}` : d}</span>
                      <span className="meta when">{when(g.finishedAt)}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
      <AdSlot slot={AD_SLOTS.records} />
    </main>
  );
}
