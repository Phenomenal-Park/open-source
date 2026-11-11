"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type GeoPos = { lat: number; lng: number; accuracy: number; heading: number | null };

/**
 * Location is only requested after the user taps "My location" (§58): explain → request → watchPosition.
 * follow=true keeps the map centered; manual pan sets follow=false; tapping locate again resumes.
 */
export function useGeolocation() {
  const [pos, setPos] = useState<GeoPos | null>(null);
  const [follow, setFollow] = useState(false);
  const [error, setError] = useState<"denied" | "unavailable" | null>(null);
  const watchId = useRef<number | null>(null);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) { setError("unavailable"); return; }
    setFollow(true);
    if (watchId.current != null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: Number.isFinite(p.coords.heading ?? NaN) ? p.coords.heading : null });
      },
      (e) => { setError(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"); setFollow(false); if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }, []);

  useEffect(() => () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); }, []);

  return { pos, follow, setFollow, start, error, active: watchId.current != null };
}

/** Has the user already granted location? Then no explanation step is needed. */
export async function locationGranted(): Promise<boolean> {
  try {
    const s = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return s?.state === "granted";
  } catch {
    return false;
  }
}
