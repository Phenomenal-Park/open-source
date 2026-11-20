import { useEffect, useState } from "react";
import { ACHIEVEMENTS } from "../achievements.ts";
import { api, loadSession } from "../api.ts";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";
import { lang, t } from "../i18n/index.ts";

/** 업적 화면(광고 있음): 업적 목록, 로그인했으면 내가 받은 뱃지 표시 */
export function AchievementsPage() {
  const [mine, setMine] = useState<string[] | null>(null);
  useEffect(() => {
    const s = loadSession();
    if (s?.verified) api.me(s.token).then((m) => setMine(m.user.badges ?? []), () => undefined);
  }, []);
  return (
    <main className="page narrow">
      <section className="panel">
        <p className="muted">{t("ach.intro")}</p>
        {ACHIEVEMENTS.length === 0 ? <p className="muted">{t("ach.soon")}</p> : (
          <ul className="ach-list">
            {ACHIEVEMENTS.map((a) => (
              <li key={a.id} className={mine?.includes(a.id) ? "got" : ""}>
                <span className="badge big" aria-hidden>{a.icon}</span>
                <span><b>{a.name[lang]}</b><br /><span className="muted">{a.desc[lang]}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AdSlot slot={AD_SLOTS.achievements} />
    </main>
  );
}
