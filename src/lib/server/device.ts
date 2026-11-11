import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

// Random anonymous device identifier (§63). No fingerprinting. httpOnly so page scripts can't read it;
// the database only ever stores its sha256.
export const DEVICE_COOKIE = "msm_device";

export async function readDeviceToken(): Promise<string | null> {
  const c = (await cookies()).get(DEVICE_COOKIE)?.value;
  return c && /^[a-f0-9]{64}$/.test(c) ? c : null;
}

export async function ensureDeviceToken(): Promise<string> {
  const existing = await readDeviceToken();
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 400,
  });
  return token;
}
