import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { env, isLocalMode } from "./env";
import { adminRpc, localUserId, type Caller } from "./db";

export type AdminCaller = Extract<Caller, { kind: "admin" }>;
export type Whoami = { user_id: string | null; role: "owner" | "admin" | "field_worker" | null; aal: string | null; require_mfa: boolean; profile_role: string | null };

const LOCAL_COOKIE = "msm_local_admin";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component: middleware refreshes the session */
        }
      },
    },
  });
}

// ── local dev session (signed cookie); unavailable in production ──
function sign(v: string): string {
  return createHmac("sha256", env.localSessionSecret).update(v).digest("hex");
}
export async function setLocalSession(userId: string) {
  const exp = Date.now() + 12 * 3600_000;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(LOCAL_COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 12 * 3600 });
}
async function readLocalSession(): Promise<string | null> {
  const raw = (await cookies()).get(LOCAL_COOKIE)?.value;
  if (!raw || !env.localSessionSecret) return null;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig) return null;
  const good = sign(`${id}.${exp}`);
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Date.now() > Number(exp)) return null;
  return id;
}
export async function clearLocalSession() {
  (await cookies()).delete(LOCAL_COOKIE);
}

export async function localLogin(email: string, password: string): Promise<string | null> {
  if (!isLocalMode() || !env.localAdminPassword || !env.localSessionSecret || password.length < 8) return null;
  const a = Buffer.from(password);
  const b = Buffer.from(env.localAdminPassword);
  if (email !== env.localAdminEmail || a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return localUserId(email);
}

/** Resolve the calling admin. Authorization itself is enforced by the database on every RPC. */
export async function getAdminCaller(): Promise<AdminCaller | null> {
  if (isLocalMode()) {
    const id = await readLocalSession();
    return id ? { kind: "admin", local: { userId: id, aal: "aal1" } } : null;
  }
  if (!env.supabaseUrl) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser(); // verifies the JWT with Supabase Auth
  if (!data.user) return null;
  return { kind: "admin", supabase };
}

export async function whoami(caller: AdminCaller): Promise<Whoami> {
  return adminRpc<Whoami>(caller, "admin_whoami");
}
