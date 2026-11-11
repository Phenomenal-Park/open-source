import type { MetadataRoute } from "next";
import { LOCALES } from "@/lib/i18n/config";
import { GUIDE_SLUGS } from "@/lib/guides";
import { SITE_URL } from "@/lib/seo";
import { getSitemap } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

// Indexable: home map, rankings, guides, stall details, food pages. Never filter combinations (§113).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await getSitemap().catch(() => ({ stalls: [], foods: [] as string[] }));
  const out: MetadataRoute.Sitemap = [];
  const langs = (path: string) => ({ languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])) });
  for (const l of LOCALES) {
    out.push({ url: `${SITE_URL}/${l}`, changeFrequency: "daily", alternates: langs("") });
    out.push({ url: `${SITE_URL}/${l}/rankings`, changeFrequency: "daily", alternates: langs("/rankings") });
    out.push({ url: `${SITE_URL}/${l}/guides`, changeFrequency: "monthly", alternates: langs("/guides") });
    for (const g of GUIDE_SLUGS) out.push({ url: `${SITE_URL}/${l}/guides/${g}`, changeFrequency: "monthly", alternates: langs(`/guides/${g}`) });
    for (const s of data.stalls) out.push({ url: `${SITE_URL}/${l}/stalls/${s.slug}`, lastModified: s.updated_at, alternates: langs(`/stalls/${s.slug}`) });
    for (const f of data.foods) out.push({ url: `${SITE_URL}/${l}/food/${f}`, alternates: langs(`/food/${f}`) });
  }
  return out;
}
