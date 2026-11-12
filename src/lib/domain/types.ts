import type { DayHours } from "./hours";
import type { Price } from "./price";

export type I18n = Record<string, string>;

export type Hint = {
  relation: "near" | "in_front" | "opposite" | "beside";
  verified: boolean;
  text_i18n: I18n;
  landmark: { name_i18n: I18n; short_i18n: I18n } | null;
};

export type StallCardItem = { name: string; name_i18n: I18n; price: Price; rep: boolean; sub: string | null };

export type StallCard = {
  id: string;
  slug: string;
  category_code: string;
  kind: "food" | "retail";
  official_name: string | null;
  names: I18n;
  lat: number;
  lng: number;
  line_id: string | null;
  progress: number | null;
  hint: Hint;
  items: StallCardItem[];
  tags: string[];
  rating: { avg: number | null; count: number };
  hours_mode: "DEFAULT" | "CUSTOM";
  hours: DayHours[] | null;
  halal: boolean;
  card: boolean | null;
  photo: string | null;
  // rankings
  rank?: number;
  week_avg?: number;
  week_count?: number;
  distance_m?: number;
  item_price?: Price;
};

export type MenuEntry = {
  id: string;
  name: string;
  name_i18n: I18n;
  price: Price;
  rep: boolean;
  spice: number | null;
  spice_source: string;
  community_spice: { count: number; level: number | null };
  my_spice: number | null;
  food_code: string | null;
  kind: "food" | "retail";
};

export type Review = {
  id: string;
  nickname: string | null;
  rating: number;
  original_language: string | null;
  original_text: string | null;
  price_matched: boolean | null;
  created_at: string;
  translations: I18n;
};

export type Photo = { id: string; storage_path: string; kind: string; up: number; down: number; my_vote: number | null; created_at: string };

export type StallDetail = StallCard & {
  is_active: boolean;
  raw_lat: number | null;
  raw_lng: number | null;
  menu: MenuEntry[];
  review_summary: { avg: number | null; count: number; taste: number | null; value: number | null; kindness: number | null };
  reviews: Review[];
  photos: Photo[];
  payments: { card_worked: number; card_failed: number; cash_used: number; last_at: string | null };
  dietary: { claim: string; verified: boolean; menu_item_id: string | null }[];
  last_verified_at: string | null;
  updated_at: string;
};

export type Category = { code: string; kind: "food" | "retail"; color: string; color_dark: string; name_i18n: I18n };
export type Subcategory = { code: string; category_code: string; name_i18n: I18n };
export type Landmark = { code: string; name_i18n: I18n; short_i18n?: I18n; lat: number; lng: number; kind: string; priority: number; id?: string };

export type Reference = {
  area: { center_lat: number; center_lng: number; default_zoom: number; timezone: string };
  default_hours: DayHours[];
  categories: Category[];
  subcategories: Subcategory[];
  landmarks: Landmark[];
};

export type DisplayLine = {
  id: string; path: [number, number][]; name?: string; is_active?: boolean;
  street_group?: string | null; side?: "left" | "right" | null; center_path?: [number, number][] | null; width_m?: number | null;
};

/** Display lines for the marker layout, with the sidewalk side of two-sided streets. */
export function layoutLines(lines: DisplayLine[]): { id: string; path: [number, number][]; outward: 1 | -1 | 0; roadWidthM: number | null }[] {
  return lines.map((l) => ({ id: l.id, path: l.path, outward: l.side === "left" ? 1 : l.side === "right" ? -1 : 0, roadWidthM: l.width_m ?? null }));
}

/** Roads to draw on the fallback map: one per street (centre + width), or the line itself for single-side lines. */
export function streetDecor(lines: DisplayLine[]): { path: [number, number][]; widthM: number }[] {
  const seen = new Set<string>();
  const out: { path: [number, number][]; widthM: number }[] = [];
  for (const l of lines) {
    if (l.street_group && l.center_path && l.width_m) {
      if (seen.has(l.street_group)) continue;
      seen.add(l.street_group);
      out.push({ path: l.center_path, widthM: l.width_m });
    } else out.push({ path: l.path, widthM: 8 });
  }
  return out;
}
