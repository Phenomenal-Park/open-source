import { useEffect, useState } from "react";
import { api, ApiError, loadSession, saveSession, type Me, type RecordsPage as Page, type Session } from "../api.ts";
import { formatRating } from "../online/protocol.ts";
import { AuthBox } from "../components/AuthBox.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";
import { pointsToNextRank } from "../rating/ranks.ts";
import { rankName, t } from "../i18n/index.ts";
import { RecordItem, recordHref } from "../components/RecordList.tsx";
import { RecentRecords } from "./RecordsPage.tsx";

export function ProfilePage() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<Page | null>(null);

  useEffect(() => {
    if (!session?.verified) return;
    api.records(session.user.username).then(setRecords, () => undefined);
    api.me(session.token).then(setMe, (e) => {
      if (e instanceof ApiError && e.status === 401) {
        saveSession(null);
        setSession(null);
      } else setError(e.message);
    });
  }, [session]);

  if (!session || !session.verified) {
    return (
      <main className="page narrow">
        <section className="panel">
          <h2>{t(session ? "account.verifyTitle" : "account.login")}</h2>
          <AuthBox session={session} onSession={setSession} />
        </section>
        <AdSlot slot={AD_SLOTS.profile} />
      </main>
    );
  }

  const u = me?.user ?? session.user;
  const next = pointsToNextRank(u.rating);
  return (
    <main className="page narrow">
      <section className="panel profile">
        <h2>{u.username}</h2>
        <div className="profile-rank">
          <span className="big-rank">{rankName(u.rating)}</span>
          <span className="big-rating">{t("points", { rating: formatRating(u.rating, u.provisional) })}</span>
        </div>
        {u.provisional && <p className="muted">{t("profile.provisional")}</p>}
        {next && <p className="muted">{t("profile.toNext", { rank: rankName(next.next.minRating), n: next.points })}</p>}
        <dl className="stats">
          <div><dt>{t("profile.rated")}</dt><dd>{t("profile.games", { n: u.games })}</dd></div>
          <div><dt>{t("profile.record")}</dt><dd>{t("profile.wld", { w: u.wins, l: u.losses, d: u.draws })}</dd></div>
          {/* 승률 = 승 ÷ (승 + 패 + 무). 무승부는 승리가 아니다 */}
          <div><dt>{t("profile.winRate")}</dt><dd>{u.wins + u.losses + u.draws ? `${Math.round((u.wins / (u.wins + u.losses + u.draws)) * 1000) / 10}%` : "-"}</dd></div>
          <div><dt>{t("profile.maxRating")}</dt><dd>{u.maxRating}</dd></div>
          <div><dt>{t("profile.streak")}</dt><dd>{u.winStreak}</dd></div>
        </dl>
        <label className="check setting">
          <input
            type="checkbox"
            checked={me?.settings.allowAi ?? true}
            disabled={!me || saving}
            onChange={async (e) => {
              const allowAi = e.target.checked;
              setMe((m) => (m ? { ...m, settings: { allowAi } } : m)); // 바로 반영, 실패하면 되돌림
              setSaving(true);
              try {
                const r = await api.settings(session.token, allowAi);
                setMe((m) => (m ? { ...m, settings: r.settings } : m));
              } catch (err) {
                setMe((m) => (m ? { ...m, settings: { allowAi: !allowAi } } : m));
                setError(err instanceof Error ? err.message : t("err.saveFailed"));
              } finally {
                setSaving(false);
              }
            }}
          />
          <span>{t("profile.allowAi")}</span>
        </label>
        <div className="seat-buttons">
          <a className="btn small" href={`/records?user=${encodeURIComponent(u.username)}`}>{t("profile.myRecords")}</a>
          <button
            className="btn small ghost"
            onClick={() => {
              void api.logout(session.token).catch(() => undefined);
              saveSession(null);
              setSession(null);
            }}
          >
            {t("profile.logout")}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </section>
      {records && (
        <section className="panel records">
          <h2>{t("fav.title")} <span className="muted-inline">{t("fav.count", { n: records.favorites.length, max: records.favoritesMax })}</span></h2>
          {records.favorites.length ? (
            <ol className="record-list">
              {records.favorites.map((g) => <RecordItem key={g.id} g={g} href={recordHref(u.username, g.id)} />)}
            </ol>
          ) : <p className="muted">{t("fav.empty")}</p>}
          <p className="muted small-note">{t("fav.note", { max: records.favoritesMax })}</p>
        </section>
      )}
      {records && (
        <section className="panel records">
          <h2>{t("profile.recent")}</h2>
          <RecentRecords first={records} />
        </section>
      )}
      <AdSlot slot={AD_SLOTS.profile} />
    </main>
  );
}
