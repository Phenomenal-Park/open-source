import "server-only";

// Per-instance sliding-window limiter for login and mutation endpoints. The database adds a
// shared per-device backstop (private.rate_limit). Behind Cloudflare, add WAF rate-limit rules too.
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= max) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (!v.hits.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return true;
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}
