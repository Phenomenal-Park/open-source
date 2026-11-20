import { useEffect, useMemo, useState } from "react";
import { api, ApiError, loadSession, type GameRecord, type RecordsPage as Page, type RecordSummary } from "../api.ts";
import { makeConfig, replayMoves } from "../game/index.ts";
import { FAVORITES_MAX, formatRating, HIDDEN_CAPTURE_TARGET } from "../online/protocol.ts";
import { Board } from "../components/Board.tsx";
import { Scoreboard } from "../components/Scoreboard.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";
import { RecordItem, recordHref } from "../components/RecordList.tsx";
import { colorName, displayName, formatDate, rankName, t } from "../i18n/index.ts";

/** 명승부 박제/해제 버튼(내가 둔 대국일 때만) */
function FavoriteButton({ game }: { game: GameRecord }) {
  const session = loadSession();
  const [ids, setIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (session?.verified) api.myFavorites(session.token).then((r) => setIds(r.gameIds), () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mine = session && [game.players.black.username, game.players.white.username].includes(session.user.username);
  if (!session || !mine || ids === null) return null;
  const on = ids.includes(game.id);
  return (
    <div className="fav-box">
      <button
        className={`btn small ${on ? "ghost" : "primary"}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.setFavorite(session.token, game.id, !on);
            setIds((x) => (on ? x!.filter((i) => i !== game.id) : [...x!, game.id]));
          } catch (e) {
            setError(e instanceof ApiError ? e.message : t("err.generic"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {on ? t("fav.remove") : t("fav.add")} · {t("fav.count", { n: ids.length, max: FAVORITES_MAX })}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
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
    const config = g.hiddenMove ? makeConfig(g.boardSize, { hiddenMove: true, captureTarget: { ...HIDDEN_CAPTURE_TARGET } }) : makeConfig(g.boardSize);
    const r = replayMoves(config, g.moves.slice(0, step), g.hiddenIndex ?? null);
    return r.ok ? r.state : null;
  }, [g, step]);
  if (error) return <p className="form-error">{error}</p>;
  if (!g || !state) return <p className="muted">{t("rec.loading")}</p>;
  const n = g.moves.length;
  const label = (c: "black" | "white") => {
    const p = g.players[c];
    return { name: displayName(p.username), rating: p.rating !== null ? formatRating(p.rating, p.provisional) : undefined };
  };
  return (
    <section className="viewer">
      <p className="viewer-title">
        {g.winner
          ? t("rec.title", { mode: t(`rec.mode.${g.mode}`), color: colorName(g.winner), reason: t(`reason.${g.reason}`), when: formatDate(g.finishedAt) })
          : `${t(`rec.mode.${g.mode}`)} · ${t("result.draw")} · ${formatDate(g.finishedAt)}`}
      </p>
      <Scoreboard state={state} names={{ black: label("black"), white: label("white") }} />
      <div className="board-wrap">
        <Board state={state} onPlay={() => undefined} disabled fx={null} hiddenMark={state.hidden && state.hidden.index >= 0 && state.board[state.hidden.pos.row][state.hidden.pos.col] ? state.hidden.pos : null} />
      </div>
      <div className="viewer-controls">
        <button className="btn small" onClick={() => setStep(0)} disabled={step === 0} aria-label={t("rec.first")}>⏮</button>
        <button className="btn small" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label={t("rec.prev")}>◀</button>
        <span className="step">{t("rec.step", { s: step, n })}</span>
        <button className="btn small" onClick={() => setStep((s) => Math.min(n, s + 1))} disabled={step === n} aria-label={t("rec.next")}>▶</button>
        <button className="btn small" onClick={() => setStep(n)} disabled={step === n} aria-label={t("rec.last")}>⏭</button>
      </div>
      <input className="step-range" type="range" min={0} max={n} value={step} onChange={(e) => setStep(Number(e.target.value))} aria-label={t("rec.range")} />
      <FavoriteButton game={g} />
    </section>
  );
}

/** 최근 기보 목록(20판씩 더 보기, 최대 100판) — 프로필에서도 쓴다 */
export function RecentRecords({ first, currentId }: { first: Page; currentId?: string | null }) {
  const [games, setGames] = useState<RecordSummary[]>(first.games);
  const [busy, setBusy] = useState(false);
  const name = first.user.username;
  return (
    <>
      {games.length === 0 ? <p className="muted">{t("rec.none")}</p> : (
        <ol className="record-list">
          {games.map((g) => <RecordItem key={g.id} g={g} href={recordHref(name, g.id)} current={g.id === currentId} />)}
        </ol>
      )}
      {games.length < first.total && (
        <button
          className="btn wide more"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await api.records(name, games.length);
              setGames((x) => [...x, ...next.games.filter((g) => !x.some((y) => y.id === g.id))]);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("rec.more")} ({games.length}/{first.total})
        </button>
      )}
    </>
  );
}

export function RecordsPage() {
  const params = new URLSearchParams(location.search);
  const user = params.get("user") ?? "";
  const gameId = params.get("game");
  const [data, setData] = useState<Page | null>(null);
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
        <>
          {data.favorites.length > 0 && (
            <section className="panel records">
              <h2>{t("fav.title")} <span className="muted-inline">{t("fav.count", { n: data.favorites.length, max: data.favoritesMax })}</span></h2>
              <ol className="record-list">
                {data.favorites.map((g) => <RecordItem key={g.id} g={g} href={recordHref(data.user.username, g.id)} current={g.id === gameId} />)}
              </ol>
            </section>
          )}
          <section className="panel records">
            <h2>
              {displayName(data.user.username)} <span className="score-rank">{rankName(data.user.rating)}</span>{" "}
              <span className="seat-rating">{t("points", { rating: formatRating(data.user.rating, data.user.provisional) })}</span>
            </h2>
            <p className="muted">{t("rec.recent", { n: data.total })}</p>
            <RecentRecords first={data} currentId={gameId} />
          </section>
        </>
      )}
      <AdSlot slot={AD_SLOTS.records} />
    </main>
  );
}
