import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceInput, minKnownPrice, parsePriceInput } from "@/lib/domain/price";
import { detectLocale, pick } from "@/lib/i18n/config";
import { layoutMarkers, markerMetrics, spaceAlongLine } from "@/lib/map/layout";
import { getMessages } from "@/lib/i18n";
import { hintText, stallTitle } from "@/lib/domain/display";
import ko from "@/lib/i18n/messages/ko";

describe("prices (§45, §91)", () => {
  it("formats types", () => {
    expect(formatPrice({ type: "FIXED", amount: 5000 })).toBe("₩5,000");
    expect(formatPrice({ type: "RANGE", min: 3000, max: 10000 })).toBe("₩3,000–₩10,000");
    expect(formatPrice({ type: "VARIES" })).toBeNull();
    expect(formatPrice({ type: "UNKNOWN" })).toBeNull();
  });
  it("field input: 5000 → 5,000; ₩ never required", () => {
    expect(parsePriceInput("5000")).toBe(5000);
    expect(parsePriceInput("₩5,000")).toBe(5000);
    expect(parsePriceInput("")).toBeNull();
    expect(formatPriceInput(5000)).toBe("5,000");
  });
  it("min known price for filters", () => {
    expect(minKnownPrice({ type: "RANGE", min: 3000, max: 9000 })).toBe(3000);
    expect(minKnownPrice({ type: "VARIES" })).toBeNull();
  });
});

describe("locale detection (§5)", () => {
  it("maps browsers", () => {
    expect(detectLocale("ko-KR,ko;q=0.9")).toBe("ko");
    expect(detectLocale("ja")).toBe("ja");
    expect(detectLocale("zh-CN,zh;q=0.9")).toBe("zh-cn");
    expect(detectLocale("zh-Hans-SG")).toBe("zh-cn");
    expect(detectLocale("zh-TW")).toBe("en"); // Traditional not supported yet
    expect(detectLocale("fr-FR,fr;q=0.9")).toBe("en");
    expect(detectLocale("fr;q=0.9,ja;q=0.8")).toBe("ja");
    expect(detectLocale(null)).toBe("en");
  });
  it("vi is registered but not enabled yet (§120)", () => {
    expect(detectLocale("vi-VN")).toBe("en");
  });
  it("data fallback chain", () => {
    expect(pick({ ko: "가", en: "A" }, "ja")).toBe("A");
    expect(pick({ ko: "가" }, "ja")).toBe("가");
  });
  it("all catalogs have the same keys as ko", () => {
    const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    const base = keys(ko).sort();
    for (const l of ["en", "ja", "zh-cn"]) expect(keys(getMessages(l)).sort()).toEqual(base);
  });
});

describe("display naming (§8, §40)", () => {
  const t = getMessages("en");
  const hint = { relation: "near" as const, verified: false, text_i18n: {}, landmark: { name_i18n: { en: "UNIQLO Myeongdong" }, short_i18n: { en: "UNIQLO", ko: "유니클로" } } };
  it("defaults to 'Near'", () => {
    expect(hintText(hint, "en", t)).toBe("Near UNIQLO");
    expect(hintText(hint, "ko", getMessages("ko"))).toBe("유니클로 근처");
  });
  it("strong relation only when verified", () => {
    expect(hintText({ ...hint, relation: "opposite", verified: false }, "en", t)).toBe("Near UNIQLO");
    expect(hintText({ ...hint, relation: "opposite", verified: true }, "en", t)).toBe("Opposite UNIQLO");
  });
  it("never invents an official name", () => {
    const s = { names: {}, official_name: null, items: [{ name: "딸기모찌", name_i18n: { en: "Strawberry mochi" }, price: { type: "FIXED" as const, amount: 5000 }, rep: true, sub: null }] };
    expect(stallTitle(s, "en")).toBe("Strawberry mochi");
    expect(stallTitle(s, "ko")).toBe("딸기모찌");
  });
});

describe("magnetic marker layout (§33–§36)", () => {
  it("size targets by zoom", () => {
    expect(markerMetrics(14).size).toBe(4);
    expect(markerMetrics(17).size).toBe(14);
    expect(markerMetrics(20).size).toBe(24);
  });
  it("spacing keeps order and min distance with minimal displacement", () => {
    const out = spaceAlongLine([0, 1, 2, 50], 10);
    for (let i = 1; i < out.length; i++) expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(out[3]).toBe(50); // far marker untouched
    expect((out[0] + out[1] + out[2]) / 3).toBeCloseTo(1); // cluster stays centred on its true position
  });
  it("markers stay on the line (move only along the tangent), unrotated", () => {
    const line = { id: "L", path: [[37.5600, 126.9800], [37.5610, 126.9810]] as [number, number][] };
    const project = (lat: number, lng: number) => ({ x: (lng - 126.98) * 100000, y: (37.561 - lat) * 100000 });
    const items = [0, 0.5, 1, 1.5].map((p, i) => ({ id: `s${i}`, lat: 0, lng: 0, line_id: "L", progress: p }));
    const placed = layoutMarkers(items, [line], project, 17);
    for (const p of placed) {
      // on the segment from (0,100) to (100,0): x + y = 100
      expect(p.x + p.y).toBeCloseTo(100, 6);
    }
    const xs = placed.sort((a, b) => a.id.localeCompare(b.id)).map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs); // order preserved
  });
});
