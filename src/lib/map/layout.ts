// Magnetic marker layout (§31–§36).
// raw spot → assigned display line (DB projection = progress in meters) → screen polyline
// → minimum-displacement spacing ALONG the line tangent → rendered marker (never rotated).
// Dense streets: shrink marker first, then allow small along-line displacement (§34).

export type XY = { x: number; y: number };
export type Projector = (lat: number, lng: number) => XY;

export type LayoutInput = { id: string; lat: number; lng: number; line_id: string | null; progress: number | null };
export type LayoutLine = { id: string; path: [number, number][] };
export type Placed = { id: string; x: number; y: number; size: number };

/** Marker size/gap targets by zoom (§36), smoothly interpolated. */
const SIZE_STOPS: [number, number, number][] = [
  // zoom, size px, gap px
  [14, 4, 1], [15, 7, 1.5], [16, 10, 3], [17, 12, 3.5], [18, 18, 5], [19, 22, 5.5], [20, 24, 6],
];
export function markerMetrics(zoom: number): { size: number; gap: number } {
  if (zoom <= SIZE_STOPS[0][0]) return { size: SIZE_STOPS[0][1], gap: SIZE_STOPS[0][2] };
  for (let i = 1; i < SIZE_STOPS.length; i++) {
    const [z1, s1, g1] = SIZE_STOPS[i];
    const [z0, s0, g0] = SIZE_STOPS[i - 1];
    if (zoom <= z1) {
      const t = (zoom - z0) / (z1 - z0);
      return { size: s0 + (s1 - s0) * t, gap: g0 + (g1 - g0) * t };
    }
  }
  const last = SIZE_STOPS[SIZE_STOPS.length - 1];
  return { size: last[1], gap: last[2] };
}

function metersBetween(a: [number, number], b: [number, number]): number {
  const k = 111320 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot((b[1] - a[1]) * k, (b[0] - a[0]) * 110574);
}

type ScreenLine = { pts: XY[]; cumPx: number[]; cumM: number[] };

function toScreenLine(line: LayoutLine, project: Projector): ScreenLine {
  const pts = line.path.map(([la, ln]) => project(la, ln));
  const cumPx = [0];
  const cumM = [0];
  for (let i = 1; i < pts.length; i++) {
    cumPx.push(cumPx[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    cumM.push(cumM[i - 1] + metersBetween(line.path[i - 1], line.path[i]));
  }
  return { pts, cumPx, cumM };
}

function metersToPx(sl: ScreenLine, m: number): number {
  const { cumM, cumPx } = sl;
  if (m <= 0) return 0;
  for (let i = 1; i < cumM.length; i++) {
    if (m <= cumM[i]) {
      const seg = cumM[i] - cumM[i - 1] || 1;
      return cumPx[i - 1] + ((m - cumM[i - 1]) / seg) * (cumPx[i] - cumPx[i - 1]);
    }
  }
  return cumPx[cumPx.length - 1];
}

function pointAtPx(sl: ScreenLine, s: number): XY {
  const { pts, cumPx } = sl;
  const total = cumPx[cumPx.length - 1];
  // beyond the ends: extrapolate along end tangents so spacing still works
  if (s <= 0 || s >= total) {
    const [a, b, base] = s <= 0 ? [pts[0], pts[1], 0] : [pts[pts.length - 2], pts[pts.length - 1], total];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const o = s <= 0 ? pts[0] : pts[pts.length - 1];
    const d = s - base;
    return { x: o.x + ((b.x - a.x) / len) * d, y: o.y + ((b.y - a.y) / len) * d };
  }
  for (let i = 1; i < cumPx.length; i++) {
    if (s <= cumPx[i]) {
      const seg = cumPx[i] - cumPx[i - 1] || 1;
      const t = (s - cumPx[i - 1]) / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
  }
  return pts[pts.length - 1];
}

/**
 * Minimum total squared displacement such that consecutive positions are ≥ d apart, order preserved.
 * Substitute u_i = s_i − i·d → isotonic regression (pool adjacent violators) → add back.
 */
export function spaceAlongLine(s: number[], d: number): number[] {
  const u = s.map((v, i) => v - i * d);
  const blocks: { sum: number; n: number }[] = [];
  for (const v of u) {
    blocks.push({ sum: v, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!;
      blocks[blocks.length - 1].sum += b.sum;
      blocks[blocks.length - 1].n += b.n;
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.n);
  return out.map((v, i) => v + i * d);
}

export function layoutMarkers(items: LayoutInput[], lines: LayoutLine[], project: Projector, zoom: number): Placed[] {
  const base = markerMetrics(zoom);
  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const byLine = new Map<string, LayoutInput[]>();
  const out: Placed[] = [];
  for (const it of items) {
    if (it.line_id && it.progress != null && lineMap.has(it.line_id)) {
      const arr = byLine.get(it.line_id) ?? [];
      arr.push(it);
      byLine.set(it.line_id, arr);
    } else {
      const p = project(it.lat, it.lng);
      out.push({ id: it.id, x: p.x, y: p.y, size: base.size });
    }
  }
  for (const [lid, arr] of byLine) {
    const sl = toScreenLine(lineMap.get(lid)!, project);
    arr.sort((a, b) => (a.progress! - b.progress!) || a.id.localeCompare(b.id));
    const s0 = arr.map((a) => metersToPx(sl, a.progress!));
    // 1) shrink, 2) tighten gap, 3) accept small displacement
    let size = base.size;
    let gap = base.gap;
    let placed = spaceAlongLine(s0, size + gap);
    const maxShift = () => Math.max(0, ...placed.map((v, i) => Math.abs(v - s0[i])));
    while (maxShift() > Math.max(4, size * 1.2) && size > 3) {
      size = Math.max(3, size * 0.85);
      gap = Math.max(1, gap * 0.85);
      placed = spaceAlongLine(s0, size + gap);
    }
    placed.forEach((s, i) => {
      const p = pointAtPx(sl, s);
      out.push({ id: arr[i].id, x: p.x, y: p.y, size });
    });
  }
  return out;
}

/** Web-Mercator helpers for the schematic (no-key) map. */
export const TILE = 256;
export function mercX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * TILE * 2 ** zoom;
}
export function mercY(lat: number, zoom: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** zoom;
}
export function invMercX(x: number, zoom: number): number {
  return (x / (TILE * 2 ** zoom)) * 360 - 180;
}
export function invMercY(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}
export function niceScale(mpp: number, maxPx = 90): { meters: number; px: number } {
  const steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  let best = steps[0];
  for (const s of steps) if (s / mpp <= maxPx) best = s;
  return { meters: best, px: best / mpp };
}
