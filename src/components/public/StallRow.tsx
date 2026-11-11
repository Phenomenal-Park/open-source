import Link from "next/link";
import { fmt, type Messages } from "@/lib/i18n";
import type { StallCard } from "@/lib/domain/types";
import { hintText, itemName, photoUrl, priceText, stallTitle } from "@/lib/domain/display";
import { IconChevronRight, IconStore, Star } from "@/components/ui/icons";

/** Ranking/list row: rank · image · name · hint · ★ · count · representative price · detail affordance (§24). */
export function StallRow({ s, locale, t, rank, priceOverride }: { s: StallCard; locale: string; t: Messages; rank?: number; priceOverride?: StallCard["item_price"] }) {
  const rep = s.items.find((i) => i.rep) ?? s.items[0];
  const img = photoUrl(s.photo);
  const avg = s.week_avg ?? s.rating.avg;
  const count = s.week_count ?? s.rating.count;
  return (
    <Link href={`/${locale}/stalls/${s.slug}`} className="rank">
      {rank != null && <span className="rank__n">{rank}</span>}
      {img ? <img className="rank__img" src={img} alt="" loading="lazy" /> : <span className="rank__img muted" aria-hidden><IconStore /></span>}
      <span className="rank__body">
        <span className="rank__title ellipsis" style={{ display: "block" }}>{stallTitle(s, locale)}</span>
        <span className="rank__meta">
          <span className="ellipsis">{hintText(s.hint, locale, t)}</span>
          {count > 0 && avg != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: "var(--text)" }}><Star size={13} />{avg.toFixed(1)}</span>}
          {count > 0 && <span>{fmt(t.rankings.reviews, { n: count })}</span>}
        </span>
        {rep && <span className="small" style={{ color: "var(--text-2)" }}>{itemName(rep, locale)} {priceText(priceOverride ?? rep.price, t)}</span>}
      </span>
      <IconChevronRight size={18} className="muted" />
    </Link>
  );
}
