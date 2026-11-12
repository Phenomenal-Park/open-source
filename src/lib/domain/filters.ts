// Public map filters (§16–§17). Within a group: OR. Across groups: AND.
import type { StallCard } from "./types";
import { effectiveHours, isOpenNow, type DayHours } from "./hours";
import { minKnownPrice } from "./price";

export type Filters = {
  open: boolean;
  /** price range (₩); max === PRICE_MAX means "and above"; null = any price */
  price: PriceRange | null;
  halal: boolean;
  card: boolean;
  /** major categories (OR) */
  categories: string[];
  /** public subcategories (OR) — only applied when exactly one category is selected */
  subs: string[];
};

export type PriceRange = { min: number; max: number };

export const NO_FILTERS: Filters = { open: false, price: null, halal: false, card: false, categories: [], subs: [] };

/** Price slider: ₩0 – ₩20,000+ in ₩1,000 steps (street-stall prices cluster in this span). */
export const PRICE_MIN = 0;
export const PRICE_MAX = 20000;
export const PRICE_STEP = 1000;

/** The full span means "any price" → no filter. */
export function normalizeRange(r: PriceRange): PriceRange | null {
  const min = Math.max(PRICE_MIN, Math.min(r.min, r.max));
  const max = Math.min(PRICE_MAX, Math.max(r.min, r.max));
  return min <= PRICE_MIN && max >= PRICE_MAX ? null : { min, max };
}

export function filtersActive(f: Filters): boolean {
  return f.open || f.price != null || f.halal || f.card || f.categories.length > 0;
}

/** Inclusive on both ends; the top of the slider is open-ended ("₩20,000 이상"). */
export function inRange(price: number, r: PriceRange): boolean {
  return price >= r.min && (r.max >= PRICE_MAX || price <= r.max);
}

export function matchesFilters(s: StallCard, f: Filters, defaults: DayHours[], now?: Date): boolean {
  if (f.categories.length && !f.categories.includes(s.category_code)) return false;
  if (f.categories.length === 1 && f.subs.length && !s.items.some((i) => i.sub && f.subs.includes(i.sub))) return false;
  if (f.open && !isOpenNow(effectiveHours(s.hours_mode, s.hours, defaults), now)) return false;
  if (f.price) {
    const prices = s.items.map((i) => minKnownPrice(i.price)).filter((x): x is number => x != null);
    if (!prices.some((p) => inRange(p, f.price!))) return false; // unknown prices never match a price filter
  }
  if (f.halal && !s.halal) return false;
  if (f.card && s.card !== true) return false;
  return true;
}
