import "server-only";
import { env, isLocalMode } from "./env";

export class RpcError extends Error {
  constructor(message: string, public code: string | undefined, public status: number) {
    super(message);
  }
}

export type Caller =
  | { kind: "public" }
  | { kind: "admin"; supabase?: SupabaseLike; local?: { userId: string; aal: "aal1" | "aal2" } };

type SupabaseLike = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };

function statusFor(code: string | undefined, message: string): number {
  if (code === "42501" || /not authorized|insufficient role|forbidden|permission denied/.test(message)) return 403;
  if (code === "P0429" || message === "rate limited") return 429;
  if (code === "22023" || code === "22P02" || code === "23514" || code === "23505" || code === "23502") return 400;
  return 500;
}

// ── local Postgres adapter (dev/test only): runs the SAME RPCs under the SAME roles + RLS ──
let pool: import("pg").Pool | null = null;
async function localPool() {
  if (!pool) {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: env.localDbUrl, max: 5 });
    pool.on("error", (e) => console.warn("local pg pool:", e.message)); // idle client dropped (e.g. db reset)
  }
  return pool;
}

async function localRpc(fn: string, args: Record<string, unknown>, role: "anon" | "authenticated", claims: Record<string, unknown>) {
  if (!/^[a-z_]+$/.test(fn)) throw new RpcError("bad function", undefined, 400);
  const p = await localPool();
  const client = await p.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const keys = Object.keys(args);
    keys.forEach((k) => { if (!/^[a-z_]+$/.test(k)) throw new RpcError("bad arg", undefined, 400); });
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const values = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    });
    const res = await client.query(sql, values);
    await client.query("commit");
    return res.rows[0]?.r ?? null;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    if (e instanceof RpcError) throw e;
    const err = e as { message: string; code?: string };
    throw new RpcError(err.message, err.code, statusFor(err.code, err.message));
  } finally {
    client.release();
  }
}

// ── public calls: anon key + server secret (never a service-role key) ──
let anonClient: SupabaseLike | null = null;
async function anon(): Promise<SupabaseLike> {
  if (!anonClient) {
    const { createClient } = await import("@supabase/supabase-js");
    anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return anonClient;
}

export function isConfigured(): boolean {
  return (!!env.localDbUrl && process.env.NODE_ENV !== "production") || (!!env.supabaseUrl && !!env.supabaseAnonKey);
}

export async function publicRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const full = { p_secret: env.serverSecret, ...args };
  if (isLocalMode()) return (await localRpc(fn, full, "anon", { role: "anon" })) as T;
  const { data, error } = await (await anon()).rpc(fn, full);
  if (error) throw new RpcError(error.message, error.code, statusFor(error.code, error.message));
  return data as T;
}

export async function adminRpc<T = unknown>(caller: Extract<Caller, { kind: "admin" }>, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (caller.local) {
    if (!isLocalMode()) throw new RpcError("forbidden", "42501", 403);
    return (await localRpc(fn, args, "authenticated", { sub: caller.local.userId, role: "authenticated", aal: caller.local.aal })) as T;
  }
  if (!caller.supabase) throw new RpcError("not authorized", "42501", 403);
  const { data, error } = await caller.supabase.rpc(fn, args);
  if (error) throw new RpcError(error.message, error.code, statusFor(error.code, error.message));
  return data as T;
}

/** Local mode helper: look up a local auth user id by email (dev only). */
export async function localUserId(email: string): Promise<string | null> {
  if (!isLocalMode()) return null;
  const p = await localPool();
  const r = await p.query("select id from auth.users where email = $1", [email]);
  return r.rows[0]?.id ?? null;
}
