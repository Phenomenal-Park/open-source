"use client";
export class AdminError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Call an allowlisted admin RPC. The DB enforces the caller's role on every call. */
export async function adminCall<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/admin/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args), credentials: "same-origin" });
  } catch {
    throw new AdminError("network", 0);
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { window.location.href = "/admin/login"; throw new AdminError("unauthenticated", 401); }
  if (!r.ok) throw new AdminError(j.error ?? "error", r.status);
  return j.data as T;
}

export function errorText(e: unknown): string {
  if (!(e instanceof AdminError)) return "오류가 발생했어요";
  if (e.status === 0) return "네트워크 오류 — 다시 저장을 눌러 주세요 (중복 저장되지 않아요)";
  if (e.status === 403) return "권한이 없어요";
  if (e.status === 429) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요";
  const map: Record<string, string> = {
    "invalid category": "카테고리를 선택해 주세요", "coordinate outside area": "명동 범위를 벗어난 위치예요",
    "large move: register a new spot instead": "15m 이상 이동했어요. 새 위치로 등록해 주세요", "custom hours need 7 days": "영업시간을 확인해 주세요",
  };
  return map[e.message] ?? e.message;
}

export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}
