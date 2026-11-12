import { describe, expect, it } from "vitest";
import { filtersActive, inBand, matchesFilters, NO_FILTERS } from "@/lib/domain/filters";
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
  it("price bands: ~3,000 | 3,000–5,000 | 5,000–10,000 | 10,000~", () => {
    expect([inBand(3000, 0), inBand(3000, 1), inBand(3001, 1), inBand(5000, 1), inBand(10000, 2), inBand(10001, 3)]).toEqual([true, false, true, true, true, true]);
    const s = stall({ items: [item(2000), item(15000)] });
    expect(matchesFilters(s, { ...NO_FILTERS, band: 0 }, D)).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, band: 3 }, D)).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, band: 1 }, D)).toBe(false);
    expect(matchesFilters(stall({ items: [item(null)] }), { ...NO_FILTERS, band: 0 }, D)).toBe(false); // unknown price never claims a band
  });
  it("groups are AND", () => {
    const s = stall({ category_code: "snack", halal: true, card: true, items: [item(4000)] });
    const f = { ...NO_FILTERS, categories: ["snack"], band: 1, halal: true, card: true, open: true };
    expect(matchesFilters(s, f, D, MON_17)).toBe(true);
    expect(matchesFilters({ ...s, card: null }, f, D, MON_17)).toBe(false); // unknown card ≠ card accepted
    expect(matchesFilters(s, f, D, new Date("2026-11-16T03:00:00Z"))).toBe(false); // Monday 12:00 KST, before 16:00
  });
});
