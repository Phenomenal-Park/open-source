import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { pick } from "@/lib/i18n/config";
import { alternates } from "@/lib/seo";
import { getFood } from "@/lib/server/queries";
import { PublicHeader } from "@/components/public/Header";
import { StallRow } from "@/components/public/StallRow";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const f = await getFood(slug);
  if (!f) return {};
  const name = pick(f.name_i18n, locale);
  const t = getMessages(locale);
  return { title: `${name} – ${t.siteName}`, description: `${name}: ${f.stalls.length} · ${t.metaDescription}`, alternates: alternates(locale, `/food/${slug}`),
    robots: f.stalls.length ? undefined : { index: false } };
}

export default async function FoodPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const f = await getFood(slug);
  if (!f) notFound();
  const t = getMessages(locale);
  const name = pick(f.name_i18n, locale);
  const sorted = [...f.stalls].sort((a, b) => (b.rating.avg ?? 0) - (a.rating.avg ?? 0));
  return (
    <div className="app">
      <PublicHeader locale={locale} t={t} title={name} backHref={`/${locale}`} />
      <main className="page">
        <section className="section">
          {sorted.length === 0 && <p className="muted">{t.search.empty}</p>}
          {sorted.map((s) => <StallRow key={s.id} s={s} locale={locale} t={t} priceOverride={s.item_price} />)}
        </section>
      </main>
    </div>
  );
}
