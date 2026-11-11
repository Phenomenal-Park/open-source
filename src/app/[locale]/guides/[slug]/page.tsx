import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n/config";
import { alternates } from "@/lib/seo";
import { getGuide, getGuides, GUIDE_LABELS, GUIDE_SLUGS } from "@/lib/guides";
import { PublicHeader } from "@/components/public/Header";
import { AdSlot } from "@/components/public/AdSlot";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => GUIDE_SLUGS.map((slug) => ({ locale, slug })));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const g = getGuide(locale, slug);
  if (!g) return {};
  return { title: g.title, description: g.summary, alternates: alternates(locale, `/guides/${slug}`) };
}

export default async function GuidePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const g = getGuide(locale, slug);
  if (!g) notFound();
  const t = getMessages(locale);
  const L = GUIDE_LABELS[locale] ?? GUIDE_LABELS.en;
  return (
    <div className="app">
      <PublicHeader locale={locale} t={t} title={g.title} backHref={`/${locale}/guides`} />
      <main className="page prose">
        <p style={{ fontWeight: 600, color: "var(--text)", marginTop: 18 }}>{g.summary}</p>
        {g.body.map((b, i) => (
          <div key={i}>
            {b.h && <h2>{b.h}</h2>}
            <p>{b.p}</p>
            {i === 0 && <AdSlot position="guide-article" t={t} />}
          </div>
        ))}
        <h2>{L.title}</h2>
        <ul>
          {getGuides(locale).filter((x) => x.slug !== slug).map((x) => <li key={x.slug}><Link href={`/${locale}/guides/${x.slug}`} className="linkbtn">{x.title}</Link></li>)}
        </ul>
        <p><Link href={`/${locale}`} className="linkbtn">{t.nav.map} →</Link></p>
      </main>
    </div>
  );
}
