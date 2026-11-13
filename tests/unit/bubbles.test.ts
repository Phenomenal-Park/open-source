import { describe, expect, it } from "vitest";
import { hiddenBubbles, layoutMarkersDetailed, metersPerPixel, removeOverlapsDetailed, spreadRank } from "@/lib/map/layout";

describe('"+n" bubbles for stalls hidden at this zoom', () => {
  it("one bubble per crowded stretch, counts add up, far stretches stay separate", () => {
    const hidden = [
      { id: "a", x: 100, y: 100, size: 6 }, { id: "b", x: 110, y: 104, size: 6 }, { id: "c", x: 125, y: 108, size: 6 }, // stretch 1
      { id: "d", x: 400, y: 400, size: 6 }, // stretch 2
    ];
    const b = hiddenBubbles(hidden, []);
    expect(b.map((x) => x.count).sort()).toEqual([1, 3]);
    expect(b.reduce((n, x) => n + x.count, 0)).toBe(hidden.length);
  });
  it("bubble never covers a visible square when there is room nearby", () => {
    const visible = Array.from({ length: 9 }, (_, i) => ({ id: `v${i}`, x: 100 + i * 9, y: 100, size: 7 }));
    const [b] = hiddenBubbles([{ id: "h", x: 136, y: 100, size: 7 }], visible);
    for (const v of visible) {
      const apart = Math.abs(v.x - b.x) >= v.size / 2 + b.w / 2 || Math.abs(v.y - b.y) >= v.size / 2 + b.h / 2;
      expect(apart).toBe(true);
    }
  });
  it("dense street zoomed out: hidden stalls are all accounted for by bubbles", () => {
    const line = { id: "L", path: [[37.5600, 126.98], [37.5630, 126.98]] as [number, number][] };
    const items = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, lat: 0, lng: 0, line_id: "L", progress: i * 2.8 })); // a stall every 2.8 m
    const mpp = metersPerPixel(37.56, 15);
    const project = (lat: number, lng: number) => ({ x: (lng - 126.98) * 88000 / mpp, y: (37.563 - lat) * 110574 / mpp });
    const { placed, hidden } = layoutMarkersDetailed(items, [line], project, mpp);
    expect(hidden.length).toBeGreaterThan(0);
    expect(placed.length + hidden.length).toBe(items.length);
    const bubbles = hiddenBubbles(hidden, placed);
    expect(bubbles.reduce((n, b) => n + b.count, 0)).toBe(hidden.length);
  });
});

import { offsetPath } from "@/lib/map/layout";
describe("diagonal streets (upright squares)", () => {
  it("stalls that fit are all shown, and every corner stays inside the street", () => {
    const mpp = 0.5; // zoomed in
    const project = (lat: number, lng: number) => ({ x: (lng - 126.98) * 88300 / mpp, y: (37.562 - lat) * 110574 / mpp });
    // 45° street (NE), 16 m wide
    const center: [number, number][] = [[37.5600, 126.9800], [37.5600 + 0.0016, 126.9800 + 0.0016 * 110574 / 88300]];
    const L = { id: "L", path: offsetPath(center, 8), outward: 1 as const, roadWidthM: 16, group: "g", centerPath: center };
    const R = { id: "R", path: offsetPath(center, -8), outward: -1 as const, roadWidthM: 16, group: "g", centerPath: center };
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, lat: 0, lng: 0, line_id: i % 2 ? "R" : "L", progress: 10 + i * 4 })); // 8 m apart per side
    const { placed, hidden } = layoutMarkersDetailed(items, [L, R], project, mpp);
    expect(hidden.length).toBe(0);
    // distance from each square corner to the centre line ≤ half width (in px)
    const a = project(center[0][0], center[0][1]), b = project(center[1][0], center[1][1]);
    const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny);
    const halfPx = 8 / mpp;
    for (const p of placed)
      for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = p.x + (cx * p.size) / 2, y = p.y + (cy * p.size) / 2;
        expect(Math.abs(((x - a.x) * nx + (y - a.y) * ny) / nl)).toBeLessThanOrEqual(halfPx + 1e-6);
      }
  });
  it("which stalls stay visible: higher priority (e.g. open now) first, equal ones spread evenly, never random", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => spreadRank(k, 8))).toEqual([0, 0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875]);
    // a row of 9 squares only 4 px apart: only every other one can stay
    const row = Array.from({ length: 9 }, (_, k) => ({ id: `s${k}`, x: k * 4, y: 0, size: 6 }));
    const ranks = row.map((_, k) => spreadRank(k, row.length));
    const even = removeOverlapsDetailed(row, () => 1, 1, ranks).placed.map((p) => p.id).sort();
    expect(even).toEqual(["s0", "s2", "s4", "s6", "s8"]); // survivors spread over the whole street
    const again = removeOverlapsDetailed(row, () => 1, 1, ranks).placed.map((p) => p.id).sort();
    expect(again).toEqual(even); // stable: the same stalls every time
    // s3 is open now (higher priority): it stays, its closed neighbours give way
    const open = removeOverlapsDetailed(row, (id) => (id === "s3" ? 3 : 2), 1, ranks).placed.map((p) => p.id);
    expect(open).toContain("s3");
    expect(open).not.toContain("s2");
    expect(open).not.toContain("s4");
  });
});
