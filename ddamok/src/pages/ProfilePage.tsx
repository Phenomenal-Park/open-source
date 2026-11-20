import { useEffect, useState } from "react";
import { api, ApiError, loadSession, saveSession, type Me, type PublicUser, type RecordsPage as Page, type Session } from "../api.ts";
import { formatRating } from "../online/protocol.ts";
import { AuthBox } from "../components/AuthBox.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";
import { pointsToNextRank } from "../rating/ranks.ts";
import { displayName, rankName, t } from "../i18n/index.ts";
import { RecordItem, recordHref } from "../components/RecordList.tsx";
import { RecentRecords } from "./RecordsPage.tsx";
import { Badges } from "../components/Badges.tsx";

export function ProfilePage() {
  const other = new URLSearchParams(location.search).get("user");
  const own = loadSession()?.user.username;
  if (other && other.normalize("NFC").toLowerCase() !== own?.normalize("NFC").toLowerCase()) return <PublicProfile name={other} />;
  return <MyProfile />;
}

function MyProfile() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  return (
    <main className="page narrow">
      <ProfileSearch />
      <section className="panel profile">
        <ProfileStats u={u} />
        <div className="seat-buttons">
          <a className="btn small" href={`/records?user=${encodeURIComponent(u.username)}`}>{t("profile.myRecords")}</a>
          <a className="btn small" href="/achievements">{t("profile.achievements")}</a>
        </div>
        {error && <p className="form-error">{error}</p>}
      </section>
      {records && <ProfileRecords records={records} />}
      <AccountBox token={session.token} onGone={() => { saveSession(null); setSession(null); }} />
      <AdSlot slot={AD_SLOTS.profile} />
    </main>
  );
}

/** 닉네임으로 다른 사람 프로필 찾기 */
function ProfileSearch({ value = "" }: { value?: string }) {
  return (
    <form className="panel search" method="get" action="/profile">
      <input name="user" aria-label={t("rec.nickname")} placeholder={t("profile.search")} defaultValue={value} maxLength={20} required />
      <button className="btn primary" type="submit">{t("btn.find")}</button>
    </form>
  );
}

/** 급·점수·전적 카드(내 프로필·다른 사람 프로필 공통) */
function ProfileStats({ u }: { u: PublicUser }) {
  const next = pointsToNextRank(u.rating);
  return (
    <>
      <h2>{displayName(u.username)} <Badges ids={u.badges} /></h2>
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
    </>
  );
}

/** 명승부 + 최근 대국(종류별 나눠 보기) */
function ProfileRecords({ records }: { records: Page }) {
  const name = records.user.username;
  return (
    <>
      <section className="panel records">
        <h2>{t("fav.title")} <span className="muted-inline">{t("fav.count", { n: records.favorites.length, max: records.favoritesMax })}</span></h2>
        {records.favorites.length ? (
          <ol className="record-list">
            {records.favorites.map((g) => <RecordItem key={g.id} g={g} href={recordHref(name, g.id)} />)}
          </ol>
        ) : <p className="muted">{t("fav.empty")}</p>}
        <p className="muted small-note">{t("fav.note", { max: records.favoritesMax })}</p>
      </section>
      <section className="panel records">
        <h2>{t("profile.recent")}</h2>
        <RecentRecords first={records} />
      </section>
    </>
  );
}

/** 다른 사람 프로필: /profile?user=닉네임 (로그인 없이 볼 수 있다) */
function PublicProfile({ name }: { name: string }) {
  const [records, setRecords] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.records(name).then(setRecords, (e) => setError(e.message));
  }, [name]);
  return (
    <main className="page narrow">
      <ProfileSearch value={name} />
      {error && <p className="form-error">{error}</p>}
      {records && (
        <>
          <section className="panel profile">
            <ProfileStats u={records.user} />
            {records.user.bot && <p className="muted">{t("profile.isBot")}</p>}
            <div className="seat-buttons">
              <a className="btn small" href={`/records?user=${encodeURIComponent(records.user.username)}`}>{t("profile.theirRecords")}</a>
            </div>
          </section>
          <ProfileRecords records={records} />
        </>
      )}
      <AdSlot slot={AD_SLOTS.profile} />
    </main>
  );
}

/** 프로필 맨 아래: 로그아웃 · 계정 삭제(비밀번호 다시 입력 + 확인) */
function AccountBox({ token, onGone }: { token: string; onGone: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="panel account-block">
      <h2>{t("account.title")}</h2>
      <div className="seat-buttons">
        <button className="btn small" onClick={() => { void api.logout(token).catch(() => undefined); onGone(); }}>{t("profile.logout")}</button>
        <button className="btn small danger" onClick={() => setOpen((x) => !x)} aria-expanded={open}>{t("account.delete")}</button>
      </div>
      {open && (
        <form
          className="account-block"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!window.confirm(t("account.deleteConfirm"))) return;
            setBusy(true);
            setError(null);
            try {
              await api.deleteAccount(token, password);
              window.alert(t("account.deleted"));
              onGone();
              location.href = "/";
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="muted small-note">{t("account.deleteNote")}</p>
          <input type="password" autoComplete="current-password" aria-label={t("account.passwordAgain")} placeholder={t("account.passwordAgain")}
            value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn danger" type="submit" disabled={busy || !password}>{t("account.delete")}</button>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </section>
  );
}
