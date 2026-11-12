"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt, type Messages } from "@/lib/i18n";
import type { StallCard } from "@/lib/domain/types";
import { hintText, stallTitle } from "@/lib/domain/display";
import { IconChevronRight, Star } from "@/components/ui/icons";

/**
 * One-line ticker (§20–§21). Left label → Ranking page. Rotating entry → that stall's detail page.
 * Rotates 1→5 every ~5 s with an upward slide; never wraps; no progress dots or medals.
 */
export function RankingTicker({ items, locale, t }: { items: StallCard[]; locale: string; t: Messages }) {
  const top = items.slice(0, 5);
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (top.length < 2 || paused) return;
    const id = setInterval(() => {
      setI((cur) => { setPrev(cur); return (cur + 1) % top.length; });
    }, 5000);
    return () => clearInterval(id);
  }, [top.length, paused]);

  return (
    <div className="ticker">
      <Link href={`/${locale}/rankings`} className="ticker__label">
        {t.ticker.label}<IconChevronRight size={15} strokeWidth={2.4} />
      </Link>
      <span className="ticker__sep" aria-hidden />
      <div className="ticker__viewport" aria-live="off" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        {top.length === 0 && <div className="ticker__item muted" data-state="active">{t.ticker.empty}</div>}
        {top.map((s, idx) => {
          const state = idx === i ? "active" : idx === prev ? "leave" : "enter";
          const hint = hintText(s.hint, locale, t);
          return (
            <Link key={s.id} href={`/${locale}/stalls/${s.slug}`} className="ticker__item" data-state={state}
              aria-hidden={idx !== i} tabIndex={idx === i ? 0 : -1}>
              <span className="ticker__rank">{fmt(t.ticker.rank, { n: s.rank ?? idx + 1 })}</span>
              <span className="ticker__name ellipsis">{stallTitle(s, locale)}</span>
              {hint && <><span className="ticker__dot">·</span><span className="ticker__hint ellipsis">{hint}</span></>}
              <span className="ticker__dot">·</span>
              <span className="ticker__star"><Star size={15} />{(s.week_avg ?? s.rating.avg ?? 0).toFixed(1)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
