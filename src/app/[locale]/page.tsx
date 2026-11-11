import { Suspense } from "react";
import { getMessages } from "@/lib/i18n";
import { getInitialMap, getRankings, getReference } from "@/lib/server/queries";
import { PublicHeader } from "@/components/public/Header";
import { MapScreen } from "@/components/public/MapScreen";

export const dynamic = "force-dynamic";

export default async function MapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getMessages(locale);
  const reference = await getReference();
  const [map, rankings] = await Promise.all([getInitialMap(reference), getRankings()]);
  return (
    <div className="app app--map">
      <PublicHeader locale={locale} t={t} />
      <Suspense>
        <MapScreen locale={locale} t={t} reference={reference} initialStalls={map.stalls} initialLines={map.lines}
          ranking={rankings.overall.slice(0, 5)} mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} />
      </Suspense>
    </div>
  );
}
