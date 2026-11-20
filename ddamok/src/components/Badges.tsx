import { achievementById } from "../achievements.ts";
import { lang } from "../i18n/index.ts";

/** 닉네임 오른쪽의 작은 뱃지들(받은 업적). 모르는 id는 건너뛴다. */
export function Badges({ ids }: { ids?: readonly string[] }) {
  const list = (ids ?? []).map(achievementById).filter((a) => !!a);
  if (!list.length) return null;
  return (
    <span className="badges">
      {list.map((a) => <span key={a.id} className="badge" title={a.name[lang]} aria-label={a.name[lang]}>{a.icon}</span>)}
    </span>
  );
}
