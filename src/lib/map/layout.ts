// Magnetic marker layout (§31–§36).
// raw spot → assigned display line (DB projection = progress in meters) → screen polyline
// → minimum-displacement spacing ALONG the line tangent → rendered marker (never rotated).
// Dense streets: shrink marker first, then allow small along-line displacement (§34).

export type XY = { x: number; y: number };
export type Projector = (lat: number, lng: number) => XY;

export type LayoutInput = { id: string; lat: number; lng: number; line_id: string | null; progress: number | null };
/**
 * outward: which side of the line (in its own drawing direction) is the sidewalk.
 * 1 = left, -1 = right, 0 = unknown (marker centred on the line). Street edges know their side,
 * so their markers are pushed fully onto the sidewalk and never overlap the road (§33).
 */
export type LayoutLine = { id: string; path: [number, number][]; outward?: 1 | -1 | 0; roadWidthM?: number | null };
/** size = rendered square; pad = extra ring drawn outside it (e.g. the selected stall's white border), kept clear of neighbours. */
export type Placed = { id: string; x: number; y: number; size: number; pad?: number };

/**
 * Marker size follows the map scale like the streets do (operator decision 2026-11-12, replaces the §36 px table):
 * a stall square represents ~10 m of street, so zooming in/out grows/shrinks it with the road.
 * Clamped to MIN_MARKER_PX–MAX_MARKER_PX so it never disappears when far out or becomes huge when very close.
 */
/** Visual range (operator reference): zoomed out 6–8 px, normal 10–14 px, zoomed in 18–22 px. */
export const MIN_MARKER_PX = 6;
export const MAX_MARKER_PX = 22;
export const MARKER_METERS = 10;
export const GAP_METERS = 2.5;
export function markerMetrics(metersPerPx: number): { size: number; gap: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return { size: clamp(MARKER_METERS / metersPerPx, MIN_MARKER_PX, MAX_MARKER_PX), gap: clamp(GAP_METERS / metersPerPx, 1, 4) };
}

/** Same algorithm as SQL private.offset_path: shift a [[lat,lng]] polyline sideways (positive = left of travel). */
export function offsetPath(path: [number, number][], meters: number): [number, number][] {
  if (path.length < 2) return path;
  const k = 111320 * Math.cos((path[0][0] * Math.PI) / 180);
  return path.map(([la, ln], i) => {
    const [pa, pn] = path[Math.max(i - 1, 0)];
    const [na, nn] = path[Math.min(i + 1, path.length - 1)];
    const dx = (nn - pn) * k, dy = (na - pa) * 110574, len = Math.hypot(dx, dy);
    if (!len) return [la, ln];
    return [la + (dx / len) * meters / 110574, ln + (-dy / len) * meters / k];
  });
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

/** Unit tangent of the polyline at arc position s (screen px). */
function tangentAtPx(sl: ScreenLine, s: number): XY {
  const { pts, cumPx } = sl;
  let i = 1;
  while (i < cumPx.length - 1 && s > cumPx[i]) i++;
  const a = pts[i - 1], b = pts[i];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
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
 * Minimum total squared displacement such that consecutive markers don't touch, order preserved.
 * Marker i has width w[i]; required centre distance between i and i+1 is (w[i] + w[i+1]) / 2 + gap.
 * Substitute u_i = s_i − c_i (c = cumulative required distance) → isotonic regression (pool adjacent violators).
 */
export function spaceAlongLineVar(s: number[], w: number[], gap: number): number[] {
  const c: number[] = [0];
  for (let i = 1; i < s.length; i++) c.push(c[i - 1] + (w[i - 1] + w[i]) / 2 + gap);
  const blocks: { sum: number; n: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    blocks.push({ sum: s[i] - c[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!;
      blocks[blocks.length - 1].sum += b.sum;
      blocks[blocks.length - 1].n += b.n;
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.n);
  return out.map((v, i) => v + c[i]);
}

/** Uniform-width version (kept for clarity/tests). */
export function spaceAlongLine(s: number[], d: number): number[] {
  return spaceAlongLineVar(s, s.map(() => d), 0);
}

export const MIN_ROW_GAP_PX = 4;
export type LayoutOptions = {
  /** Higher = more important. Collisions are resolved in favour of higher priority (selected > match > default > muted). */
  priorityOf?: (id: string) => number;
  /** Rendered size multiplier (e.g. 1.25 for the selected stall). Space is reserved for it, so it never covers neighbours. */
  scaleOf?: (id: string) => number;
  /** Extra border width (px) drawn outside the square; also reserved. */
  padOf?: (id: string) => number;
};

/**
 * Lay out stall markers. Guarantees: markers never overlap each other (operator rule), never sit on the road
 * for two-sided streets, stay upright, and move only along their own line. Order of resolution:
 * 1) shrink markers on crowded lines, 2) spread them along the line (small displacement only),
 * 3) if they still can't fit at the minimum size, keep true positions and let the final pass hide the
 *    lower-priority ones (they reappear when zooming in).
 */
export function layoutMarkers(items: LayoutInput[], lines: LayoutLine[], project: Projector, metersPerPx: number, opts: LayoutOptions = {}): Placed[] {
  const base = markerMetrics(metersPerPx);
  const scaleOf = opts.scaleOf ?? (() => 1);
  const priorityOf = opts.priorityOf ?? (() => 1);
  const padOf = opts.padOf ?? (() => 0);
  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const byLine = new Map<string, LayoutInput[]>();
  const candidates: Placed[] = [];
  for (const it of items) {
    if (it.line_id && it.progress != null && lineMap.has(it.line_id)) {
      const arr = byLine.get(it.line_id) ?? [];
      arr.push(it);
      byLine.set(it.line_id, arr);
    } else {
      const p = project(it.lat, it.lng);
      candidates.push({ id: it.id, x: p.x, y: p.y, size: base.size * scaleOf(it.id), pad: padOf(it.id) });
    }
  }
  // Pass 1: the size each line can afford. Pass 2: one uniform size for the whole view (the smallest),
  // so every square on screen looks the same — crowded streets decide, sparse ones follow.
  const rawCount = candidates.length; // raw-position markers were pushed first
  const prepared = [...byLine].map(([lid, arr]) => {
    const line = lineMap.get(lid)!;
    const sl = toScreenLine(line, project);
    arr.sort((a, b) => (a.progress! - b.progress!) || a.id.localeCompare(b.id));
    const s0 = arr.map((a) => metersToPx(sl, a.progress!));
    const scales = arr.map((a) => scaleOf(a.id));
    const pads = arr.map((a) => padOf(a.id));
    return { line, sl, arr, s0, scales, pads };
  });
  const fit = (s0: number[], scales: number[], pads: number[], size: number, gap: number) => {
    const placed = spaceAlongLineVar(s0, scales.map((k, i) => size * k + 2 * pads[i]), gap);
    const shift = Math.max(0, ...placed.map((v, i) => Math.abs(v - s0[i])));
    return { placed, ok: shift <= Math.max(4, size * 1.5) };
  };
  let size = base.size;
  let gap = base.gap;
  for (const pr of prepared) {
    while (!fit(pr.s0, pr.scales, pr.pads, size, gap).ok && size > MIN_MARKER_PX) {
      size = Math.max(MIN_MARKER_PX, size * 0.9);
      gap = Math.max(1, gap * 0.9);
    }
  }
  for (const { line, sl, arr, s0, scales, pads } of prepared) {
    const f = fit(s0, scales, pads, size, gap);
    // Still too crowded at minimum size: don't drag markers far from their street — keep true positions;
    // the global pass below hides whichever lower-priority markers would overlap.
    const placed = f.ok ? f.placed : s0;
    const outward = line.outward ?? 0;
    placed.forEach((sPos, i) => {
      const w = size * scales[i];
      const p = pointAtPx(sl, sPos);
      if (outward) {
        // screen coords (y down): left normal of travel (tx, ty) is (ty, -tx).
        const t = tangentAtPx(sl, sPos);
        // narrow alleys: keep the two rows at least MIN_ROW_GAP_PX apart even when the road is only a few px wide
        const roadPx = line.roadWidthM ? line.roadWidthM / metersPerPx : 0;
        const d = w / 2 + pads[i] + Math.max(1, (MIN_ROW_GAP_PX - roadPx) / 2);
        p.x += outward * t.y * d;
        p.y += outward * -t.x * d;
      }
      candidates.push({ id: arr[i].id, x: p.x, y: p.y, size: w, pad: pads[i] });
    });
  }
  // markers without a display line use the same uniform size
  for (let i = 0; i < rawCount; i++) candidates[i].size = size * scaleOf(candidates[i].id);
  return removeOverlaps(candidates, priorityOf, 1);
}

/** Final guarantee: no two (upright, square) markers overlap. Higher priority wins; ties keep the earlier one. */
export function removeOverlaps(cands: Placed[], priorityOf: (id: string) => number, minGap: number): Placed[] {
  const order = cands.map((c, i) => ({ c, i, p: priorityOf(c.id) })).sort((a, b) => b.p - a.p || a.i - b.i);
  const cell = Math.max(8, ...cands.map((c) => c.size)) + minGap;
  const grid = new Map<string, Placed[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const kept: Placed[] = [];
  for (const { c } of order) {
    let hit = false;
    const gx = Math.floor(c.x / cell), gy = Math.floor(c.y / cell);
    for (let dx = -1; dx <= 1 && !hit; dx++) {
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (const o of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const need = (c.size + o.size) / 2 + (c.pad ?? 0) + (o.pad ?? 0) + minGap;
          if (Math.abs(c.x - o.x) < need && Math.abs(c.y - o.y) < need) { hit = true; break; }
        }
      }
    }
    if (hit) continue;
    kept.push(c);
    const k = key(c.x, c.y);
    const arr = grid.get(k) ?? [];
    arr.push(c);
    grid.set(k, arr);
  }
  return kept;
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
