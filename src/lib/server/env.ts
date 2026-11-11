import "server-only";

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serverSecret: process.env.MSM_SERVER_SECRET ?? "",
  localDbUrl: process.env.MSM_LOCAL_DB_URL ?? "",
  localAdminEmail: process.env.MSM_LOCAL_ADMIN_EMAIL ?? "",
  localAdminPassword: process.env.MSM_LOCAL_ADMIN_PASSWORD ?? "",
  localSessionSecret: process.env.MSM_LOCAL_SESSION_SECRET ?? "",
};

/** Local-Postgres mode is a development convenience and is hard-disabled in production. */
export function isLocalMode(): boolean {
  if (!env.localDbUrl) return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MSM_LOCAL_DB_URL must not be set in production");
  }
  return true;
}

// Guard: a service-role key must never be configured for this app.
for (const [k, v] of Object.entries(process.env)) {
  if (/SERVICE_ROLE|SUPABASE_SECRET/i.test(k) && v) {
    throw new Error(`Refusing to start: ${k} is set. This app must never hold a Supabase service-role/secret key.`);
  }
}
