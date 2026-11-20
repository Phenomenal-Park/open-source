import { useEffect, useRef, type ReactNode } from "react";
import { t } from "../i18n/index.ts";

/** 가운데 뜨는 창(순위·규칙 등). 바깥을 누르거나 Esc·닫기로 닫는다. */
export function Popup({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="popup"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }} // 바깥(배경) 누르면 닫기
    >
      <div className="popup-head">
        <h2>{title}</h2>
        <button type="button" className="popup-close" aria-label={t("btn.close")} onClick={onClose}>×</button>
      </div>
      <div className="popup-body">{open && children}</div>
    </dialog>
  );
}
