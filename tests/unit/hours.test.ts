import { describe, expect, it } from "vitest";
import { AREA_DEFAULT_HOURS, effectiveHours, formatMinute, groupHours, isDefaultHours, isOpenAt, parseTime, seoulClock } from "@/lib/domain/hours";

describe("hours (§53–§57)", () => {
  it("area defaults: Mon–Fri 16–24, Sat–Sun 13–24, all open", () => {
    expect(AREA_DEFAULT_HOURS.map((d) => [d.weekday, d.open_min, d.close_min, d.is_open])).toEqual([
      [1, 960, 1440, true], [2, 960, 1440, true], [3, 960, 1440, true], [4, 960, 1440, true], [5, 960, 1440, true], [6, 780, 1440, true], [7, 780, 1440, true],
    ]);
  });
  it("24:00 renders as 24:00, never 00:00", () => {
    expect(formatMinute(1440)).toEqual({ text: "24:00", nextDay: false });
    expect(formatMinute(1560)).toEqual({ text: "02:00", nextDay: true });
  });
  it("16:00–24:00 is open at 23:59 and closed at 00:00", () => {
    expect(isOpenAt(AREA_DEFAULT_HOURS, 1, 23 * 60 + 59)).toBe(true);
    expect(isOpenAt(AREA_DEFAULT_HOURS, 2, 0)).toBe(false);
    expect(isOpenAt(AREA_DEFAULT_HOURS, 1, 15 * 60 + 59)).toBe(false);
    expect(isOpenAt(AREA_DEFAULT_HOURS, 6, 13 * 60)).toBe(true);
  });
  it("after-midnight close carries into the next day", () => {
    const days = AREA_DEFAULT_HOURS.map((d) => (d.weekday === 5 ? { ...d, close_min: 1560 } : d));
    expect(isOpenAt(days, 6, 60)).toBe(true); // Sat 01:00 still within Fri 16:00–02:00
    expect(isOpenAt(days, 6, 150)).toBe(false);
    expect(isOpenAt(days, 1, 60)).toBe(false); // Sun→Mon not extended
  });
  it("Sunday→Monday wrap uses weekday 7", () => {
    const days = AREA_DEFAULT_HOURS.map((d) => (d.weekday === 7 ? { ...d, close_min: 1500 } : d));
    expect(isOpenAt(days, 1, 30)).toBe(true);
  });
  it("closed days", () => {
    const days = AREA_DEFAULT_HOURS.map((d) => (d.weekday === 2 ? { ...d, is_open: false } : d));
    expect(isOpenAt(days, 2, 17 * 60)).toBe(false);
  });
  it("parseTime", () => {
    expect(parseTime("16:00")).toBe(960);
    expect(parseTime("24:00")).toBe(1440);
    expect(parseTime("02:00", true)).toBe(1560);
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("12:60")).toBeNull();
  });
  it("groups weekdays like the admin summary", () => {
    expect(groupHours(AREA_DEFAULT_HOURS).map((g) => [g.from, g.to])).toEqual([[1, 5], [6, 7]]);
    expect(isDefaultHours(AREA_DEFAULT_HOURS)).toBe(true);
  });
  it("DEFAULT mode ignores stale custom rows", () => {
    expect(effectiveHours("DEFAULT", [], AREA_DEFAULT_HOURS)).toBe(AREA_DEFAULT_HOURS);
  });
  it("seoul clock is timezone-correct", () => {
    // 2026-11-11T15:30:00Z = Thu 00:30 KST
    expect(seoulClock(new Date("2026-11-11T15:30:00Z"))).toEqual({ weekday: 4, minute: 30 });
  });
});
