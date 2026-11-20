import { useEffect, useState } from "react";
import { api, loadSession, type Me } from "../api.ts";
import { LookPicker } from "../components/LookPicker.tsx";
import { lang, LANGS, setLang, t, type Lang } from "../i18n/index.ts";
import { foundSound, setSound, stoneClick, useSound, type SoundChannel } from "../sound.ts";

/** 설정: 디자인(바둑판·바둑돌) · 소리 · 언어 · 레이팅매치 AI 상대 허용(로그인 시) */
export function SettingsPage() {
  const session = loadSession();
  const [me, setMe] = useState<Me | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (session?.verified) api.me(session.token).then(setMe, (e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <main className="page narrow">
      <section className="panel settings-block">
        <h2>{t("look.title")}</h2>
        <LookPicker />
      </section>
      <section className="panel settings-block">
        <h2>{t("sound.title")}</h2>
        <SoundRow channel="stone" label={t("sound.stone")} sample={stoneClick} />
        <SoundRow channel="fx" label={t("sound.fx")} sample={foundSound} />
      </section>
      <section className="panel settings-block">
        <h2>{t("nav.language")}</h2>
        <select className="lang-select wide" aria-label={t("nav.language")} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </section>
      {session?.verified && (
        <section className="panel settings-block">
          <h2>{t("set.match")}</h2>
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
          {error && <p className="form-error">{error}</p>}
        </section>
      )}
    </main>
  );
}

/** 소리 한 갈래: 볼륨 막대 + 음소거. 막대를 놓으면 그 크기로 한 번 들려준다 */
function SoundRow({ channel, label, sample }: { channel: SoundChannel; label: string; sample: () => void }) {
  const s = useSound()[channel];
  return (
    <div className="sound-row">
      <span className="sound-label">{label}</span>
      <input
        type="range" min={0} max={100} step={5} value={s.vol} disabled={s.mute}
        aria-label={`${label} ${t("sound.volume")}`}
        onChange={(e) => setSound(channel, { vol: Number(e.target.value) })}
        onPointerUp={sample} onKeyUp={sample}
      />
      <span className="sound-vol">{s.mute ? "–" : s.vol}</span>
      <label className="check sound-mute">
        <input type="checkbox" checked={s.mute} onChange={(e) => { setSound(channel, { mute: e.target.checked }); if (!e.target.checked) sample(); }} />
        <span>{t("sound.mute")}</span>
      </label>
    </div>
  );
}
