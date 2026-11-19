import { useEffect, useState } from "react";
import { api, ApiError, loadSession, saveSession, type Me, type Session } from "../api.ts";
import { formatRating } from "../online/protocol.ts";
import { AuthBox } from "../components/AuthBox.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";
import { pointsToNextRank } from "../rating/ranks.ts";

export function ProfilePage() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.verified) return;
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
          <h2>{session ? "이메일 인증" : "로그인"}</h2>
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
          <span className="big-rank">{u.rank}</span>
          <span className="big-rating">{formatRating(u.rating, u.provisional)}점</span>
        </div>
        {u.provisional && <p className="muted">점수 뒤의 ?는 아직 확정되지 않은 점수라는 뜻입니다. 레이팅매치를 10판쯤 두면 확정됩니다.</p>}
        {next && <p className="muted">{next.next.label}까지 {next.points}점</p>}
        <dl className="stats">
          <div><dt>레이팅매치</dt><dd>{u.games}판</dd></div>
          <div><dt>전적</dt><dd>{u.wins}승 {u.losses}패</dd></div>
          <div><dt>연승</dt><dd>{u.winStreak}</dd></div>
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
                setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
              } finally {
                setSaving(false);
              }
            }}
          />
          레이팅매치에서 15초 안에 사람을 못 찾으면 AI와 둡니다(점수 반영)
        </label>
        <div className="seat-buttons">
          <a className="btn small" href={`/records?user=${encodeURIComponent(u.username)}`}>내 기보</a>
          <button
            className="btn small ghost"
            onClick={() => {
              void api.logout(session.token).catch(() => undefined);
              saveSession(null);
              setSession(null);
            }}
          >
            로그아웃
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </section>
      <AdSlot slot={AD_SLOTS.profile} />
    </main>
  );
}
