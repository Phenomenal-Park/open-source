"use client";
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error ?? "error", r.status);
  return j.data as T;
}
