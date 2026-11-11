import { NextResponse, type NextRequest } from "next/server";
import { publicRpc } from "@/lib/server/db";
import { ensureDeviceToken, readDeviceToken } from "@/lib/server/device";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { jsonError, num, sameOrigin, str, uuid } from "@/lib/server/http";

type Def = { fn: string; write: boolean; perMin: number; args: (b: Record<string, unknown>, device: string | null) => Record<string, unknown> };

// Explicit allowlist. Nothing else is reachable from the browser.
const ROUTES: Record<string, Def> = {
  map: { fn: "public_map_stalls", write: false, perMin: 90, args: (b) => ({ p_min_lat: num(b.min_lat), p_min_lng: num(b.min_lng), p_max_lat: num(b.max_lat), p_max_lng: num(b.max_lng) }) },
  stall: { fn: "public_stall", write: false, perMin: 90, args: (b, d) => ({ p_slug: str(b.slug, 120), p_device_token: d }) },
  search: { fn: "public_search", write: false, perMin: 60, args: (b) => ({ p_query: str(b.q, 40) }) },
  nearby: { fn: "public_nearby_stalls", write: false, perMin: 30, args: (b) => ({ p_lat: num(b.lat), p_lng: num(b.lng) }) },
  rankings: { fn: "public_rankings", write: false, perMin: 30, args: () => ({}) },
  spice: { fn: "public_spice_vote", write: true, perMin: 30, args: (b, d) => ({ p_device_token: d, p_item: uuid(b.item_id), p_level: b.level === null ? null : num(b.level) }) },
  "photo-vote": { fn: "public_photo_vote", write: true, perMin: 30, args: (b, d) => ({ p_device_token: d, p_photo: uuid(b.photo_id), p_vote: num(b.vote) }) },
  review: {
    fn: "public_submit_review", write: true, perMin: 6,
    args: (b, d) => ({
      p_device_token: d,
      p: {
        stall_id: uuid(b.stall_id), rating: num(b.rating), taste: num(b.taste), value: num(b.value), kindness: num(b.kindness),
        price_matched: typeof b.price_matched === "boolean" ? b.price_matched : null, open_now: typeof b.open_now === "boolean" ? b.open_now : null,
        payment: str(b.payment, 20), text: str(b.text, 1000), nickname: str(b.nickname, 30), language: str(b.language, 8),
      },
    }),
  },
  report: {
    fn: "public_submit_report", write: true, perMin: 6,
    args: (b, d) => ({ p_device_token: d, p: { stall_id: uuid(b.stall_id), menu_item_id: uuid(b.menu_item_id), kind: str(b.kind, 20), text: str(b.text, 500), price: num(b.price) } }),
  },
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ fn: string }> }) {
  const { fn } = await ctx.params;
  const def = ROUTES[fn];
  if (!def) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ip = clientIp(req.headers);
  if (!rateLimit(`pub:${fn}:${ip}`, def.perMin, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { /* empty body */ }
  try {
    const device = def.write ? await ensureDeviceToken() : await readDeviceToken();
    const data = await publicRpc(def.fn, def.args(body, device));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
