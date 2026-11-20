import { LOOK_STYLES, setLook, useLook, type Look } from "../theme.ts";
import { t } from "../i18n/index.ts";
import { Fold } from "./Fold.tsx";

/** 설정: 바둑판·바둑돌 모양(이 기기에 저장) */
export function LookPicker() {
  const look = useLook();
  const row = (key: keyof Look, label: string) => (
    <div className="look-row" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      {LOOK_STYLES.map((s) => (
        <button key={s} role="radio" aria-checked={look[key] === s} className={`chip${look[key] === s ? " on" : ""}`} onClick={() => setLook({ [key]: s })}>
          {t(`look.${s}`)}
        </button>
      ))}
    </div>
  );
  return (
    <Fold id="look" title={t("look.title")} label={t("look.title")}>
      <div className="look-picker">
        {row("board", t("look.board"))}
        {row("stones", t("look.stones"))}
      </div>
    </Fold>
  );
}
