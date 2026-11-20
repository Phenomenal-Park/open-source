import { useEffect, useState } from "react";
import { api, loadSession, type Me } from "../api.ts";
import { LookPicker } from "../components/LookPicker.tsx";
import { lang, LANGS, setLang, t, type Lang } from "../i18n/index.ts";

/** 설정: 디자인(바둑판·바둑돌) · 언어 · 레이팅매치 AI 상대 허용(로그인 시) */
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
