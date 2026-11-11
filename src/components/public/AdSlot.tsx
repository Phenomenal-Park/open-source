// Reusable ad slot (§116). Disabled until monetization: renders nothing unless enabled.
// Never placed on the map, in the selected-stall popup, or styled like a ranking row (§119).
import type { Messages } from "@/lib/i18n";

export type AdPosition = "ranking-mid" | "ranking-lower" | "guide-bottom" | "guide-article" | "stall-lower" | "reviews-mid";

export function AdSlot({ position, t }: { position: AdPosition; t: Messages }) {
  const enabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
  const preview = process.env.NEXT_PUBLIC_ADS_PREVIEW === "true";
  if (!enabled && !preview) return null;
  return (
    <aside className="adslot" data-ad-position={position} aria-label={t.ads.label} style={{ minHeight: 100 }}>
      <span className="adslot__label">{t.ads.label}</span>
      {/* AdSense / locale-matched affiliate creative is mounted here in the monetization phase. */}
    </aside>
  );
}
