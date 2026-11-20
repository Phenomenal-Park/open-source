import { useState, type ReactNode } from "react";

const key = (id: string) => `ddamok.fold.${id}`;
function stored(id: string): boolean {
  try { return localStorage.getItem(key(id)) === "1"; } catch { return false; }
}

/**
 * 접히는 상자: 처음엔 제목만 보이고, 제목(오른쪽 ⌄)을 누르면 펼쳐진다. 펼친 상태는 이 기기에 기억한다.
 * forceOpen: 진행 중인 일이 있으면(매칭 대기, AI 대국 중 등) 펼쳐 둔다.
 */
export function Fold({ id, title, children, forceOpen, extra, label }: {
  id: string; title: ReactNode; children: ReactNode; forceOpen?: boolean; extra?: ReactNode; label?: string;
}) {
  const [open, setOpen] = useState(() => stored(id));
  const isOpen = open || !!forceOpen;
  const toggle = () => {
    const next = !isOpen;
    setOpen(next);
    try { localStorage.setItem(key(id), next ? "1" : "0"); } catch { /* 기억 못 해도 동작 */ }
  };
  return (
    <section className={`panel fold${isOpen ? " open" : ""}`} aria-label={label}>
      <div className="fold-head">
        <button type="button" className="fold-toggle" aria-expanded={isOpen} onClick={toggle} disabled={!!forceOpen}>
          <h2>{title}</h2>
          <Chevron />
        </button>
        {extra}
      </div>
      {isOpen && <div className="fold-body">{children}</div>}
    </section>
  );
}

export function Chevron() {
  return (
    <svg className="chev" viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
