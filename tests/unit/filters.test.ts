import { describe, expect, it } from "vitest";
import { filtersActive, inRange, matchesFilters, NO_FILTERS, normalizeRange, PRICE_MAX } from "@/lib/domain/filters";
import { AREA_DEFAULT_HOURS } from "@/lib/domain/hours";
import type { StallCard } from "@/lib/domain/types";

const stall = (over: Partial<StallCard>): StallCard => ({
  id: "x", slug: "x", category_code: "snack", kind: "food", official_name: null, names: {}, lat: 0, lng: 0, line_id: null, progress: null,
  hint: { relation: "near", verified: false, text_i18n: {}, landmark: null }, items: [], tags: [], rating: { avg: null, count: 0 },
  hours_mode: "DEFAULT", hours: null, halal: false, card: null, photo: null, ...over,
});
const item = (amount: number | null, sub: string | null = null) => ({
  name: "a", name_i18n: {}, rep: true, sub, price: amount == null ? { type: "UNKNOWN" as const } : { type: "FIXED" as const, amount },
});
const D = AREA_DEFAULT_HOURS;
const MON_17 = new Date("2026-11-16T08:00:00Z"); // Monday 17:00 KST

describe("filters (§17: OR within a group, AND across groups)", () => {
  it("no filter → inactive, everything matches", () => {
    expect(filtersActive(NO_FILTERS)).toBe(false);
    expect(matchesFilters(stall({}), NO_FILTERS, D)).toBe(true);
  });
  it("categories are OR", () => {
    const f = { ...NO_FILTERS, categories: ["snack", "dessert_fruit"] };
    expect(matchesFilters(stall({ category_code: "snack" }), f, D)).toBe(true);
    expect(matchesFilters(stall({ category_code: "dessert_fruit" }), f, D)).toBe(true);
    expect(matchesFilters(stall({ category_code: "fashion_goods" }), f, D)).toBe(false);
  });
  it("subcategories apply only with exactly one category", () => {
    const s = stall({ items: [item(3000, "hotteok")] });
    expect(matchesFilters(s, { ...NO_FILTERS, categories: ["snack"], subs: ["egg_bread"] }, D)).toBe(false);
    expect(matchesFilters(s, { ...NO_FILTERS, categories: ["snack"], subs: ["hotteok", "egg_bread"] }, D)).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, categories: ["snack", "dessert_fruit"], subs: ["egg_bread"] }, D)).toBe(true);
  });
  it("price range: inclusive, top of the slider is open-ended, unknown never matches", () => {
    const r = { min: 3000, max: 8000 };
    expect([inRange(3000, r), inRange(8000, r), inRange(2999, r), inRange(8001, r)]).toEqual([true, true, false, false]);
    expect(inRange(50000, { min: 10000, max: PRICE_MAX })).toBe(true); // "₩10,000 이상"
    const s = stall({ items: [item(2000), item(15000)] });
    expect(matchesFilters(s, { ...NO_FILTERS, price: { min: 0, max: 3000 } }, D)).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, price: { min: 12000, max: PRICE_MAX } }, D)).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, price: { min: 4000, max: 9000 } }, D)).toBe(false);
    expect(matchesFilters(stall({ items: [item(null)] }), { ...NO_FILTERS, price: { min: 0, max: 3000 } }, D)).toBe(false);
  });
  it("full span = no price filter; reversed handles are fixed", () => {
    expect(normalizeRange({ min: 0, max: PRICE_MAX })).toBeNull();
    expect(normalizeRange({ min: 9000, max: 4000 })).toEqual({ min: 4000, max: 9000 });
  });
  it("groups are AND", () => {
    const s = stall({ category_code: "snack", halal: true, card: true, items: [item(4000)] });
    const f = { ...NO_FILTERS, categories: ["snack"], price: { min: 3000, max: 5000 }, halal: true, card: true, open: true };
    expect(matchesFilters(s, f, D, MON_17)).toBe(true);
    expect(matchesFilters({ ...s, card: null }, f, D, MON_17)).toBe(false); // unknown card ≠ card accepted
    expect(matchesFilters(s, f, D, new Date("2026-11-16T03:00:00Z"))).toBe(false); // Monday 12:00 KST, before 16:00
  });
});

import { distanceM, walkEstimate } from "@/lib/domain/walk";
describe("walking estimate", () => {
  it("distance and minutes", () => {
    const d = distanceM({ lat: 37.5600, lng: 126.9850 }, { lat: 37.5620, lng: 126.9850 });
    expect(d).toBeCloseTo(221, 0);
    expect(walkEstimate(d)).toEqual({ meters: 220, minutes: 4, arrived: false });
    expect(walkEstimate(10).arrived).toBe(true);
    expect(walkEstimate(30).minutes).toBe(1);
  });
});
