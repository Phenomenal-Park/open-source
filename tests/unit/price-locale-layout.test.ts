import { describe, expect, it } from "vitest";
import { formatPrice, formatPriceInput, minKnownPrice, parsePriceInput } from "@/lib/domain/price";
import { detectLocale, pick } from "@/lib/i18n/config";
import { layoutMarkers, markerMetrics, metersPerPixel, offsetPath, removeOverlaps, spaceAlongLine } from "@/lib/map/layout";
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
  it("marker size scales with the map like the streets (≈10 m), clamped to 6–22 px", () => {
    const z17 = metersPerPixel(37.56, 17);
    expect(markerMetrics(z17).size).toBeCloseTo(10 / z17, 6);
    expect(markerMetrics(z17 / 2).size / markerMetrics(z17).size).toBeCloseTo(2, 6); // zoom in one level → twice as big
    expect(markerMetrics(metersPerPixel(37.56, 12)).size).toBe(6); // zoomed out: 6 px minimum
    expect(markerMetrics(metersPerPixel(37.56, 21)).size).toBe(22); // zoomed in: 22 px maximum
  });
  it("street edges are offset half the width to each side", () => {
    const center: [number, number][] = [[37.561, 126.99], [37.564, 126.99]];
    const left = offsetPath(center, 6), right = offsetPath(center, -6);
    const k = 111320 * Math.cos((37.561 * Math.PI) / 180);
    expect((center[0][1] - left[0][1]) * k).toBeCloseTo(6, 3); // west of a northbound street
    expect((right[0][1] - center[0][1]) * k).toBeCloseTo(6, 3);
  });
  it("street rows sit fully INSIDE the street (never over buildings), 1 px in from each edge", () => {
    // northbound street centred on x=0 on screen, 20 px/… projection; edges at x = ∓8 px (16 m wide at 1 m/px-ish scale below)
    const project = (lat: number, lng: number) => ({ x: (lng - 126.98) * 88000, y: (37.561 - lat) * 110574 }); // ≈ 1 m per px
    const mpp = 1;
    const center: [number, number][] = [[37.5600, 126.98], [37.5610, 126.98]];
    const left = { id: "L", path: offsetPath(center, 8), outward: 1 as const, roadWidthM: 16, group: "g", centerPath: center };
    const right = { id: "R", path: offsetPath(center, -8), outward: -1 as const, roadWidthM: 16, group: "g", centerPath: center };
    const placed = layoutMarkers([{ id: "a", lat: 0, lng: 0, line_id: "L", progress: 50 }, { id: "b", lat: 0, lng: 0, line_id: "R", progress: 50 }], [left, right], project, mpp);
    const a = placed.find((p) => p.id === "a")!, b = placed.find((p) => p.id === "b")!;
    const leftEdgeX = project(37.5605, offsetPath(center, 8)[0][1]).x, rightEdgeX = project(37.5605, offsetPath(center, -8)[0][1]).x;
    expect(a.x - a.size / 2).toBeCloseTo(leftEdgeX + 1, 1);   // outer edge 1 px inside the left street edge
    expect(b.x + b.size / 2).toBeCloseTo(rightEdgeX - 1, 1);  // outer edge 1 px inside the right street edge
    expect(b.x - b.size / 2 - (a.x + a.size / 2)).toBeGreaterThanOrEqual(1.9); // rows ≈2 px apart (test projection is ~0.4% off 1 m/px)
    expect(a.size).toBeLessThanOrEqual(7); // (16 − 2 − 2) / 2 = 6 px cap, never wider than half the street
  });
  it("narrow street: still TWO rows, one each side of the centre line, never overlapping", () => {
    const project = (lat: number, lng: number) => ({ x: (lng - 126.98) * 88000 / 2, y: (37.561 - lat) * 110574 / 2 }); // 2 m per px
    const center: [number, number][] = [[37.5600, 126.98], [37.5610, 126.98]];
    const lines = [
      { id: "L", path: offsetPath(center, 3), outward: 1 as const, roadWidthM: 6, group: "g", centerPath: center },
      { id: "R", path: offsetPath(center, -3), outward: -1 as const, roadWidthM: 6, group: "g", centerPath: center },
    ];
    const items = [10, 30, 50, 70].map((p, i) => ({ id: `s${i}`, lat: 0, lng: 0, line_id: i % 2 ? "R" : "L", progress: p }));
    const placed = layoutMarkers(items, lines, project, 2);
    expect(placed).toHaveLength(4);
    const cx = project(37.5605, 126.98).x;
    for (const p of placed) {
      const left = Number(p.id.slice(1)) % 2 === 0;
      // each row stays on its own side: inner edge exactly 1 px from the centre line (rows 2 px apart)
      expect(left ? cx - (p.x + p.size / 2) : p.x - p.size / 2 - cx).toBeCloseTo(1, 1);
    }
  });
  it("markers NEVER overlap, at any zoom, even on dense crossing streets", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lines = [
      { id: "A", path: [[37.5600, 126.9800], [37.5640, 126.9840]] as [number, number][], outward: 1 as const },
      { id: "B", path: [[37.5600, 126.9800], [37.5640, 126.9840]] as [number, number][], outward: -1 as const },
      { id: "C", path: [[37.5620, 126.9790], [37.5620, 126.9850]] as [number, number][], outward: 0 as const },
    ];
    const items = Array.from({ length: 240 }, (_, i) => ({
      id: `s${i}`, lat: 37.56 + rnd() * 0.004, lng: 126.98 + rnd() * 0.004,
      line_id: i % 4 === 3 ? null : ["A", "B", "C"][i % 3], progress: rnd() * 500,
    }));
    for (const zoom of [14, 15, 16, 17, 18, 19, 20]) {
      const mpp = metersPerPixel(37.562, zoom), scale = 1 / mpp;
      const project = (lat: number, lng: number) => ({ x: (lng - 126.98) * 88000 * scale, y: (37.564 - lat) * 110574 * scale });
      const placed = layoutMarkers(items, lines, project, mpp, {
        priorityOf: (id) => (id === "s5" ? 3 : 1), scaleOf: (id) => (id === "s5" ? 1.4 : 1),
      });
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i], b = placed[j], need = (a.size + b.size) / 2;
          expect(Math.abs(a.x - b.x) >= need || Math.abs(a.y - b.y) >= need).toBe(true);
        }
      expect(placed.some((p) => p.id === "s5")).toBe(true); // selected is always shown
    }
  });
  it("collisions are resolved in favour of filter matches", () => {
    const kept = removeOverlaps([{ id: "muted", x: 0, y: 0, size: 10 }, { id: "match", x: 3, y: 0, size: 10 }], (id) => (id === "match" ? 2 : 0), 1);
    expect(kept.map((k) => k.id)).toEqual(["match"]);
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
    const placed = layoutMarkers(items, [line], project, 0.95);
    for (const p of placed) {
      // on the segment from (0,100) to (100,0): x + y = 100
      expect(p.x + p.y).toBeCloseTo(100, 6);
    }
    const xs = placed.sort((a, b) => a.id.localeCompare(b.id)).map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs); // order preserved
  });
});
