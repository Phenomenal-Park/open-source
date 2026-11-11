import type { Metadata } from "next";
import { alternates } from "@/lib/seo";
import MapPage from "../page";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // /map duplicates the home map: canonicalize to the locale root.
  return { alternates: { ...alternates(locale, ""), canonical: alternates(locale, "")?.canonical } };
}
export default MapPage;
