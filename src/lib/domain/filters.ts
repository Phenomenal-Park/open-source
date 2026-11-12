// Public map filters (§16–§17). Within a group: OR. Across groups: AND.
import type { StallCard } from "./types";
import { effectiveHours, isOpenNow, type DayHours } from "./hours";
import { minKnownPrice } from "./price";

export type Filters = {
  open: boolean;
  /** index into PRICE_BANDS, or null for any price */
  band: number | null;
  halal: boolean;
  card: boolean;
  /** major categories (OR) */
  categories: string[];
  /** public subcategories (OR) — only applied when exactly one category is selected */
  subs: string[];
};

export const NO_FILTERS: Filters = { open: false, band: null, halal: false, card: false, categories: [], subs: [] };

/** ~3,000 · 3,000–5,000 · 5,000–10,000 · 10,000~  (lower bound exclusive, upper inclusive) */
export const PRICE_BANDS: [number, number][] = [[0, 3000], [3000, 5000], [5000, 10000], [10000, Infinity]];

export function filtersActive(f: Filters): boolean {
  return f.open || f.band != null || f.halal || f.card || f.categories.length > 0;
}

export function inBand(price: number, band: number): boolean {
  const [lo, hi] = PRICE_BANDS[band];
  return band === 0 ? price <= hi : price > lo && price <= hi;
}

export function matchesFilters(s: StallCard, f: Filters, defaults: DayHours[], now?: Date): boolean {
  if (f.categories.length && !f.categories.includes(s.category_code)) return false;
  if (f.categories.length === 1 && f.subs.length && !s.items.some((i) => i.sub && f.subs.includes(i.sub))) return false;
  if (f.open && !isOpenNow(effectiveHours(s.hours_mode, s.hours, defaults), now)) return false;
  if (f.band != null) {
    const prices = s.items.map((i) => minKnownPrice(i.price)).filter((x): x is number => x != null);
    if (!prices.some((p) => inBand(p, f.band!))) return false;
  }
  if (f.halal && !s.halal) return false;
  if (f.card && s.card !== true) return false;
  return true;
}
