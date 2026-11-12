import { NextResponse, type NextRequest } from "next/server";
import { adminRpc } from "@/lib/server/db";
import { getAdminCaller } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { jsonError, sameOrigin } from "@/lib/server/http";

// Allowlisted admin RPCs → their argument names. The database re-checks the caller's role on every call.
const ALLOWED: Record<string, string[]> = {
  field_status: [], field_map: [], field_nearby_spots: ["p_lat", "p_lng", "p_radius"], field_route: ["p_route"],
  field_create_spot: ["p"], field_record_observation: ["p"], field_apply_change: ["p"],
  admin_get_stall: ["p_stall"], admin_update_stall: ["p"],
  admin_route_move: ["p_route", "p_spot", "p_to_position"], admin_route_insert: ["p_route", "p_spot", "p_after"], admin_route_remove: ["p_route", "p_spot"],
  admin_set_spot_status: ["p_spot", "p_status"], admin_merge_spots: ["p_duplicate", "p_target"],
  admin_save_display_line: ["p_id", "p_name", "p_path"], admin_delete_display_line: ["p_id"], admin_whoami: [],
  admin_save_street: ["p_group", "p_name", "p_center", "p_width"], admin_delete_street: ["p_group"],
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ fn: string }> }) {
  const { fn } = await ctx.params;
  const names = ALLOWED[fn];
  if (!names) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const caller = await getAdminCaller();
  if (!caller) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!rateLimit(`adm:${clientIp(req.headers)}`, 300, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { /* empty */ }
  const args: Record<string, unknown> = {};
  for (const n of names) if (n in body) args[n] = body[n];
  try {
    const data = await adminRpc(caller, fn, args);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
