export type Price = { type: "FIXED" | "RANGE" | "VARIES" | "UNKNOWN"; amount?: number | null; min?: number | null; max?: number | null };

export function won(n: number): string {
  return "₩" + Math.round(n).toLocaleString("en-US");
}

/** Returns formatted price, or null for VARIES/UNKNOWN so the caller can use localized wording. */
export function formatPrice(p: Price | null | undefined): string | null {
  if (!p) return null;
  if (p.type === "FIXED" && p.amount != null) return won(p.amount);
  if (p.type === "RANGE" && p.min != null && p.max != null) return p.min === p.max ? won(p.min) : `${won(p.min)}–${won(p.max)}`;
  return null;
}

/** Lowest known price (for "≤ ₩5,000" filters). */
export function minKnownPrice(p: Price | null | undefined): number | null {
  if (!p) return null;
  if (p.type === "FIXED") return p.amount ?? null;
  if (p.type === "RANGE") return p.min ?? null;
  return null;
}

/** Field input: "5000", "5,000", "₩5,000" → 5000. Empty → null. */
export function parsePriceInput(s: string): number | null {
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n <= 10_000_000 ? n : null;
}

export function formatPriceInput(n: number | null): string {
  return n == null ? "" : n.toLocaleString("en-US");
}
