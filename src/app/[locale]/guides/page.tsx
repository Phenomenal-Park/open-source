import type { Metadata } from "next";
import Link from "next/link";
import { getMessages } from "@/lib/i18n";
import { pick } from "@/lib/i18n/config";
import { alternates } from "@/lib/seo";
import { getGuides, GUIDE_LABELS } from "@/lib/guides";
import { getReference } from "@/lib/server/queries";
import { formatMinute } from "@/lib/domain/hours";
import { PublicHeader } from "@/components/public/Header";
import { GuideIcon } from "@/components/public/GuideIcon";
import { AdSlot } from "@/components/public/AdSlot";
import { IconChevronRight } from "@/components/ui/icons";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const L = GUIDE_LABELS[locale] ?? GUIDE_LABELS.en;
  return { title: L.title, description: getGuides(locale).map((g) => g.title).join(" · "), alternates: alternates(locale, "/guides") };
}

export default async function GuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getMessages(locale);
  const L = GUIDE_LABELS[locale] ?? GUIDE_LABELS.en;
  const ref = await getReference();
  const wk = ref.default_hours.find((d) => d.weekday === 1);
  const we = ref.default_hours.find((d) => d.weekday === 6);
  const range = (d?: { open_min: number; close_min: number }) => (d ? `${formatMinute(d.open_min).text}–${formatMinute(d.close_min).text}` : "");
  return (
    <div className="app">
      <PublicHeader locale={locale} t={t} title={L.title} backHref={`/${locale}`} />
      <main className="page">
        {getGuides(locale).map((g) => (
          <Link key={g.slug} href={`/${locale}/guides/${g.slug}`} className={`guide-card ${g.highlight ? "guide-card--highlight" : ""}`}>
            <span className="guide-card__icon"><GuideIcon name={g.icon} /></span>
            <span className="guide-card__body">
              <h2 className="guide-card__title">{g.title}</h2>
              {g.slug === "opening-hours" ? (
                <>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "6px 0" }}>
                    <span className="pill">{L.weekday} {range(wk)}</span><span className="muted">/</span><span className="pill">{L.weekend} {range(we)}</span>
                  </span>
                  <span className="guide-card__text small">{L.note}</span>
                </>
              ) : (
                <p className="guide-card__text">{g.summary}</p>
              )}
            </span>
            {g.slug === "report-info" && <IconChevronRight size={18} className="muted" style={{ alignSelf: "center" }} />}
          </Link>
        ))}
        <section className="guide-card" style={{ display: "block" }}>
          <h2 className="guide-card__title">{L.legend}</h2>
          <p className="guide-card__text small">{L.legendNote}</p>
          <div className="legend">
            {ref.categories.map((c) => (
              <span key={c.code} className="chip" style={{ ["--cat" as string]: `var(--c-${c.code}, ${c.color})` }}>
                <span className="chip__swatch" />{pick(c.name_i18n, locale)}
              </span>
            ))}
          </div>
        </section>
        <AdSlot position="guide-bottom" t={t} />
      </main>
    </div>
  );
}
