import { useEffect, useMemo, useState } from "react";
import { api, type GameRecord, type PublicUser, type RecordSummary } from "../api.ts";
import { makeConfig, replayMoves } from "../game/index.ts";
import { formatRating } from "../online/protocol.ts";
import { Board } from "../components/Board.tsx";
import { Scoreboard } from "../components/Scoreboard.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";
import { colorName, displayName, formatDate, rankName, t } from "../i18n/index.ts";

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
  if (!g || !state) return <p className="muted">{t("rec.loading")}</p>;
  const n = g.moves.length;
  return (
    <section className="viewer">
      <p className="viewer-title">
        {t("rec.title", { mode: t(`rec.mode.${g.mode}`), color: colorName(g.winner), reason: t(`reason.${g.reason}`), when: formatDate(g.finishedAt) })}
      </p>
      <Scoreboard state={state} names={{ black: { name: displayName(g.players.black.username) }, white: { name: displayName(g.players.white.username) } }} />
      <div className="board-wrap">
        <Board state={state} onPlay={() => undefined} disabled fx={null} />
      </div>
      <div className="viewer-controls">
        <button className="btn small" onClick={() => setStep(0)} disabled={step === 0} aria-label={t("rec.first")}>⏮</button>
        <button className="btn small" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label={t("rec.prev")}>◀</button>
        <span className="step">{t("rec.step", { s: step, n })}</span>
        <button className="btn small" onClick={() => setStep((s) => Math.min(n, s + 1))} disabled={step === n} aria-label={t("rec.next")}>▶</button>
        <button className="btn small" onClick={() => setStep(n)} disabled={step === n} aria-label={t("rec.last")}>⏭</button>
      </div>
      <input className="step-range" type="range" min={0} max={n} value={step} onChange={(e) => setStep(Number(e.target.value))} aria-label={t("rec.range")} />
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
        <input name="user" aria-label={t("rec.nickname")} placeholder={t("rec.search")} defaultValue={user} maxLength={20} required />
        <button className="btn primary" type="submit">{t("btn.find")}</button>
      </form>
      {gameId && <Viewer id={gameId} />}
      {error && <p className="form-error">{error}</p>}
      {data && (
        <section className="panel records">
          <h2>
            {displayName(data.user.username)} <span className="score-rank">{rankName(data.user.rating)}</span>{" "}
            <span className="seat-rating">{t("points", { rating: formatRating(data.user.rating, data.user.provisional) })}</span>
          </h2>
          <p className="muted">{t("rec.recent", { n: data.games.length })}</p>
          {data.games.length === 0 ? <p className="muted">{t("rec.none")}</p> : (
            <ol className="record-list">
              {data.games.map((g) => {
                const d = g.ratingAfter !== null && g.ratingBefore !== null ? g.ratingAfter - g.ratingBefore : null;
                return (
                  <li key={g.id} className={g.id === gameId ? "current" : ""}>
                    <a href={`/records?user=${encodeURIComponent(data.user.username)}&game=${g.id}`}>
                      <span className={`wl ${g.won ? "win" : "loss"}`}>{t(g.won ? "rec.win" : "rec.loss")}</span>
                      <span className={`dot ${g.color}`} aria-label={colorName(g.color)} />
                      <span className="who">{g.opponent ? displayName(g.opponent) : "?"}</span>
                      <span className="meta">{t(`rec.mode.${g.mode}`)} · {t(`reason.${g.reason}`)} · {t("result.moves", { n: g.moveCount })}</span>
                      <span className={`delta ${d && d > 0 ? "up" : d && d < 0 ? "down" : ""}`}>{d === null ? "" : d > 0 ? `+${d}` : d}</span>
                      <span className="meta when">{formatDate(g.finishedAt)}</span>
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
