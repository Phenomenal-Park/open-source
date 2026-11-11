import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { alternates, SITE_URL } from "@/lib/seo";
import { getReference, getStall } from "@/lib/server/queries";
import { readDeviceToken } from "@/lib/server/device";
import { hintText, itemName, photoUrl, priceText, stallTitle } from "@/lib/domain/display";
import { PublicHeader } from "@/components/public/Header";
import { StallDetailView } from "@/components/public/StallDetailView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const s = await getStall(slug);
  if (!s) return {};
  const t = getMessages(locale);
  const title = [stallTitle(s, locale), hintText(s.hint, locale, t)].filter(Boolean).join(" · ");
  const desc = s.menu.slice(0, 4).map((m) => `${itemName(m, locale)} ${priceText(m.price, t)}`).join(", ");
  const img = photoUrl(s.photo);
  return {
    title, description: `${title} — ${desc}`.slice(0, 160), alternates: alternates(locale, `/stalls/${slug}`),
    openGraph: { title, description: desc, images: img ? [img] : undefined },
    robots: s.is_active ? undefined : { index: false },
  };
}

export default async function StallPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const [s, ref] = await Promise.all([getStall(slug, await readDeviceToken()), getReference()]);
  if (!s) notFound();
  const t = getMessages(locale);
  // Only verifiable facts in structured data: no fabricated ratings, hours or official names (§113).
  const jsonLd = {
    "@context": "https://schema.org", "@type": s.kind === "food" ? "FoodEstablishment" : "Store",
    name: stallTitle(s, locale), url: `${SITE_URL}/${locale}/stalls/${slug}`,
    geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng },
    address: { "@type": "PostalAddress", addressLocality: "Jung-gu, Seoul", addressRegion: "Myeongdong", addressCountry: "KR" },
    ...(photoUrl(s.photo) ? { image: photoUrl(s.photo) } : {}),
  };
  return (
    <div className="app">
      <PublicHeader locale={locale} t={t} title={stallTitle(s, locale)} backHref={`/${locale}?s=${slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <StallDetailView s={s} locale={locale} t={t} reference={ref} />
    </div>
  );
}
