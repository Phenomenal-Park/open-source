import "server-only";
import { cache } from "react";
import { isConfigured, publicRpc } from "./db";
import type { Reference, StallCard, StallDetail, DisplayLine } from "@/lib/domain/types";
import { AREA_DEFAULT_HOURS } from "@/lib/domain/hours";

export type Rankings = { overall: StallCard[]; by_category: Record<string, StallCard[]> };

const FALLBACK_REFERENCE: Reference = {
  area: { center_lat: 37.5627, center_lng: 126.985, default_zoom: 17, timezone: "Asia/Seoul" },
  default_hours: AREA_DEFAULT_HOURS, categories: [], subcategories: [], landmarks: [],
};

export const getReference = cache(async (): Promise<Reference> => {
  if (!isConfigured()) return FALLBACK_REFERENCE;
  return (await publicRpc<Reference>("public_reference")) ?? FALLBACK_REFERENCE;
});

export const getRankings = cache(async (): Promise<Rankings> => {
  if (!isConfigured()) return { overall: [], by_category: {} };
  return (await publicRpc<Rankings>("public_rankings")) ?? { overall: [], by_category: {} };
});

export const getStall = cache(async (slug: string, deviceToken: string | null = null): Promise<StallDetail | null> => {
  if (!isConfigured()) return null;
  return publicRpc<StallDetail | null>("public_stall", { p_slug: slug, p_device_token: deviceToken });
});

export const getFood = cache(async (code: string) => {
  if (!isConfigured()) return null;
  return publicRpc<{ code: string; name_i18n: Record<string, string>; subcategory: string | null; stalls: StallCard[] } | null>("public_food", { p_code: code });
});

export async function getInitialMap(ref: Reference): Promise<{ stalls: StallCard[]; lines: DisplayLine[] }> {
  if (!isConfigured()) return { stalls: [], lines: [] };
  const { center_lat: la, center_lng: ln } = ref.area;
  return (await publicRpc<{ stalls: StallCard[]; lines: DisplayLine[] }>("public_map_stalls", {
    p_min_lat: la - 0.006, p_min_lng: ln - 0.008, p_max_lat: la + 0.006, p_max_lng: ln + 0.008,
  })) ?? { stalls: [], lines: [] };
}

export async function getSitemap(): Promise<{ stalls: { slug: string; updated_at: string }[]; foods: string[] }> {
  if (!isConfigured()) return { stalls: [], foods: [] };
  return (await publicRpc("public_sitemap")) ?? { stalls: [], foods: [] };
}
