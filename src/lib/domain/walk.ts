// Quick walking estimate for the in-app "빠른 길찾기" (walking first). Streets in Myeongdong are short and dense,
// so a straight-line guide + live location is the fastest help; full turn-by-turn opens in a maps app.
export const WALK_M_PER_MIN = 75; // ≈ 4.5 km/h
export const DETOUR_FACTOR = 1.3; // streets are not straight lines
export const ARRIVED_M = 15;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const k = 111320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((b.lng - a.lng) * k, (b.lat - a.lat) * 110574);
}

export function walkEstimate(meters: number): { minutes: number; meters: number; arrived: boolean } {
  return {
    meters: Math.round(meters / 10) * 10 || Math.round(meters),
    minutes: Math.max(1, Math.round((meters * DETOUR_FACTOR) / WALK_M_PER_MIN)),
    arrived: meters <= ARRIVED_M,
  };
}
