import type { Metadata } from "next";
import { Fragment } from "react";
import { getMessages } from "@/lib/i18n";
import { pick } from "@/lib/i18n/config";
import { alternates } from "@/lib/seo";
import { getRankings, getReference } from "@/lib/server/queries";
import { PublicHeader } from "@/components/public/Header";
import { StallRow } from "@/components/public/StallRow";
import { AdSlot } from "@/components/public/AdSlot";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  return { title: t.rankings.title, description: `${t.rankings.title} — ${t.rankings.basis}`, alternates: alternates(locale, "/rankings") };
}

export default async function RankingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getMessages(locale);
  const [rankings, ref] = await Promise.all([getRankings(), getReference()]);
  const overall = rankings.overall.slice(0, 20);
  return (
    <div className="app">
      <PublicHeader locale={locale} t={t} title={t.nav.rankings} backHref={`/${locale}`} />
      <main className="page">
        <h1 className="detail__title" style={{ fontSize: 21 }}>{t.rankings.title}</h1>
        <p className="muted small" style={{ margin: "2px 0 0" }}>{t.rankings.basis}</p>
        <section className="section">
          <h2 className="section__title">{t.rankings.overall}</h2>
          {overall.length === 0 && <p className="muted">{t.rankings.empty}</p>}
          {overall.map((s, i) => (
            <Fragment key={s.id}>
              <StallRow s={s} locale={locale} t={t} rank={s.rank ?? i + 1} />
              {i === 3 && overall.length > 6 && <AdSlot position="ranking-mid" t={t} />}
              {i === 11 && overall.length > 14 && <AdSlot position="ranking-lower" t={t} />}
            </Fragment>
          ))}
        </section>
        {Object.keys(rankings.by_category).length > 0 && (
          <section className="section">
            <h2 className="section__title">{t.rankings.byCategory}</h2>
            {ref.categories.filter((c) => rankings.by_category[c.code]?.length).map((c) => (
              <div key={c.code}>
                <div className="catblock__head"><span className="chip__swatch" style={{ ["--cat" as string]: `var(--c-${c.code}, ${c.color})` }} />{pick(c.name_i18n, locale)}</div>
                {rankings.by_category[c.code].slice(0, 3).map((s) => <StallRow key={s.id} s={s} locale={locale} t={t} rank={s.rank} />)}
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
