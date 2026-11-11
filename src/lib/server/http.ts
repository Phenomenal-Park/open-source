import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { RpcError } from "./db";

/** CSRF defence for cookie-authenticated POSTs: require a same-origin Origin header. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(e: unknown) {
  if (e instanceof RpcError) {
    // Do not leak SQL internals for server errors.
    const msg = e.status === 500 ? "server_error" : e.message;
    if (e.status === 500) console.error("rpc error", e.code, e.message);
    return NextResponse.json({ error: msg }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}

export const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
export const str = (v: unknown, max = 200): string | null => (typeof v === "string" ? v.slice(0, max) : null);
export const uuid = (v: unknown): string | null =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
