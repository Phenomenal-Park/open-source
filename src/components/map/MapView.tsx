"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { invMercX, invMercY, mercX, mercY, metersPerPixel, niceScale, type XY } from "@/lib/map/layout";
import { IconLocate, IconMinus, IconPlus } from "@/components/ui/icons";

export type MapViewState = {
  zoom: number;
  width: number;
  height: number;
  center: [number, number];
  project: (lat: number, lng: number) => XY;
  unproject: (x: number, y: number) => [number, number];
  mpp: number;
  version: number;
  backend: "google" | "schematic";
};

export type MapHandle = {
  panTo: (lat: number, lng: number, zoom?: number) => void;
  zoomBy: (d: number) => void;
  bounds: () => { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
  /** Show both points with some padding (px); never zooms closer than maxZoom. */
  fitPoints: (a: [number, number], b: [number, number], padding?: number, maxZoom?: number) => void;
};

type Props = {
  center: [number, number];
  zoom: number;
  apiKey?: string;
  mapId?: string;
  onTap?: (lat: number, lng: number) => void;
  onViewChange?: (s: MapViewState) => void;
  onUserPan?: () => void;
  /** Streets for the schematic backend: polyline + real width in metres. */
  decorLines?: { path: [number, number][]; widthM: number }[];
  children?: (s: MapViewState) => ReactNode;
  labels: { zoomIn: string; zoomOut: string; locate: string; schematic: string };
  onLocate?: () => void;
  locateActive?: boolean;
  controlsBottom?: number;
};

// ───────────── Google Maps loader ─────────────
let gmapsPromise: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve();
  if (!gmapsPromise) {
    gmapsPromise = new Promise((resolve, reject) => {
      const cb = "__msmGmapsReady";
      (window as unknown as Record<string, unknown>)[cb] = () => resolve();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}`;
      s.async = true;
      s.onerror = () => { gmapsPromise = null; reject(new Error("maps load failed")); };
      document.head.appendChild(s);
    });
  }
  return gmapsPromise;
}

// Quiet base map: hide ordinary business POIs so curated landmarks and stalls lead (§37).
const QUIET_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station.bus", stylers: [{ visibility: "off" }] },
];

export const MapView = forwardRef<MapHandle, Props>(function MapView(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [useGoogle, setUseGoogle] = useState(!!props.apiKey);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  return (
    <div className="mapwrap" ref={wrapRef}>
      {useGoogle && props.apiKey ? (
        <GoogleBackend {...props} innerRef={ref} size={size} onFail={() => setUseGoogle(false)} />
      ) : (
        <SchematicBackend {...props} innerRef={ref} size={size} />
      )}
    </div>
  );
});

type BackendProps = Props & { innerRef: React.ForwardedRef<MapHandle>; size: { w: number; h: number } };

function Controls({ state, props, zoomBy }: { state: MapViewState | null; props: Props; zoomBy: (d: number) => void }) {
  const scale = state ? niceScale(state.mpp) : null;
  return (
    <>
      {scale && (
        <div className="scalebar" aria-hidden>
          {scale.meters >= 1000 ? `${scale.meters / 1000} km` : `${scale.meters} m`}
          <div className="scalebar__bar" style={{ width: scale.px }} />
        </div>
      )}
      <div className="mapctl" style={props.controlsBottom ? { bottom: props.controlsBottom } : undefined}>
        {props.onLocate && (
          <button className="mapctl__btn" onClick={props.onLocate} aria-label={props.labels.locate} aria-pressed={!!props.locateActive}>
            <IconLocate />
          </button>
        )}
        <div className="mapctl__zoom">
          <button onClick={() => zoomBy(1)} aria-label={props.labels.zoomIn}><IconPlus /></button>
          <button onClick={() => zoomBy(-1)} aria-label={props.labels.zoomOut}><IconMinus /></button>
        </div>
      </div>
    </>
  );
}

// ───────────── Google backend ─────────────
function GoogleBackend(props: BackendProps & { onFail: () => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const [state, setState] = useState<MapViewState | null>(null);
  const version = useRef(0);
  const cbs = useRef(props);
  cbs.current = props;

  const compute = useCallback(() => {
    const map = mapRef.current;
    const proj = overlayRef.current?.getProjection();
    const div = divRef.current;
    if (!map || !proj || !div) return;
    const c = map.getCenter();
    const zoom = map.getZoom() ?? 17;
    if (!c) return;
    const s: MapViewState = {
      zoom, width: div.clientWidth, height: div.clientHeight, center: [c.lat(), c.lng()],
      project: (lat, lng) => {
        const p = proj.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lng));
        return { x: p?.x ?? -9999, y: p?.y ?? -9999 };
      },
      unproject: (x, y) => {
        const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(x, y));
        return [ll?.lat() ?? 0, ll?.lng() ?? 0];
      },
      mpp: metersPerPixel(c.lat(), zoom), version: ++version.current, backend: "google",
    };
    setState(s);
    cbs.current.onViewChange?.(s);
  }, []);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    loadGoogleMaps(props.apiKey!).then(() => {
      if (cancelled || !divRef.current) return;
      const map = new google.maps.Map(divRef.current, {
        center: { lat: props.center[0], lng: props.center[1] }, zoom: props.zoom,
        disableDefaultUI: true, clickableIcons: false, gestureHandling: "greedy", keyboardShortcuts: false,
        ...(props.mapId ? { mapId: props.mapId } : { styles: QUIET_STYLE }),
      });
      mapRef.current = map;
      class Proj extends google.maps.OverlayView { onAdd() {} draw() { compute(); } onRemove() {} }
      const ov = new Proj();
      ov.setMap(map);
      overlayRef.current = ov;
      const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
      map.addListener("bounds_changed", schedule);
      map.addListener("zoom_changed", schedule);
      map.addListener("dragstart", () => cbs.current.onUserPan?.());
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) cbs.current.onTap?.(e.latLng.lat(), e.latLng.lng());
      });
    }).catch(() => props.onFail());
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { compute(); }, [props.size.w, props.size.h, compute]);

  const zoomBy = (d: number) => { const m = mapRef.current; if (m) m.setZoom((m.getZoom() ?? 17) + d); };
  useImperativeHandle(props.innerRef, () => ({
    panTo: (lat, lng, zoom) => { const m = mapRef.current; if (!m) return; m.panTo({ lat, lng }); if (zoom) m.setZoom(zoom); },
    zoomBy,
    bounds: () => {
      const b = mapRef.current?.getBounds();
      if (!b) return null;
      return { minLat: b.getSouthWest().lat(), minLng: b.getSouthWest().lng(), maxLat: b.getNorthEast().lat(), maxLng: b.getNorthEast().lng() };
    },
    fitPoints: (a, b, padding = 60, maxZoom = 19) => {
      const m = mapRef.current;
      if (!m) return;
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: a[0], lng: a[1] });
      bounds.extend({ lat: b[0], lng: b[1] });
      m.fitBounds(bounds, padding);
      google.maps.event.addListenerOnce(m, "idle", () => { if ((m.getZoom() ?? 0) > maxZoom) m.setZoom(maxZoom); });
    },
  }));

  return (
    <>
      <div ref={divRef} className="map-canvas" />
      <div className="map-overlay">{state && props.children?.(state)}</div>
      <Controls state={state} props={props} zoomBy={zoomBy} />
    </>
  );
}

// ───────────── Schematic backend (no API key / local testing) ─────────────
function SchematicBackend(props: BackendProps) {
  const [view, setView] = useState({ lat: props.center[0], lng: props.center[1], zoom: props.zoom });
  const version = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; t: number; moved: boolean; pinchDist?: number; pinchZoom?: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const cbs = useRef(props);
  cbs.current = props;
  const { w, h } = props.size;

  const state = useMemo<MapViewState>(() => {
    const z = view.zoom;
    const cx = mercX(view.lng, z);
    const cy = mercY(view.lat, z);
    return {
      zoom: z, width: w, height: h, center: [view.lat, view.lng],
      project: (lat, lng) => ({ x: mercX(lng, z) - cx + w / 2, y: mercY(lat, z) - cy + h / 2 }),
      unproject: (x, y) => [invMercY(cy + y - h / 2, z), invMercX(cx + x - w / 2, z)],
      mpp: metersPerPixel(view.lat, z), version: ++version.current, backend: "schematic",
    };
  }, [view, w, h]);

  useEffect(() => { if (w && h) cbs.current.onViewChange?.(state); }, [state, w, h]);

  const zoomAround = useCallback((newZoom: number, px: number, py: number) => {
    setView((v) => {
      const z = Math.max(14, Math.min(21, newZoom));
      const cx = mercX(v.lng, v.zoom), cy = mercY(v.lat, v.zoom);
      const lng = invMercX(cx + px - w / 2, v.zoom), lat = invMercY(cy + py - h / 2, v.zoom);
      const nx = mercX(lng, z) - (px - w / 2), ny = mercY(lat, z) - (py - h / 2);
      return { lat: invMercY(ny, z), lng: invMercX(nx, z), zoom: z };
    });
  }, [w, h]);

  const zoomBy = (d: number) => zoomAround(view.zoom + d, w / 2, h / 2);
  useImperativeHandle(props.innerRef, () => ({
    panTo: (lat, lng, zoom) => setView((v) => ({ lat, lng, zoom: zoom ?? v.zoom })),
    zoomBy,
    bounds: () => {
      const [maxLat, minLng] = state.unproject(0, 0);
      const [minLat, maxLng] = state.unproject(w, h);
      return { minLat, minLng, maxLat, maxLng };
    },
    fitPoints: (a, b, padding = 60, maxZoom = 19) => {
      const dx = Math.abs(mercX(a[1], 0) - mercX(b[1], 0)) || 1e-9;
      const dy = Math.abs(mercY(a[0], 0) - mercY(b[0], 0)) || 1e-9;
      const z = Math.min(maxZoom, Math.log2(Math.max(40, w - 2 * padding) / dx), Math.log2(Math.max(40, h - 2 * padding) / dy));
      setView({ lat: (a[0] + b[0]) / 2, lng: (a[1] + b[1]) / 2, zoom: Math.max(14, Math.min(21, z)) });
    },
  }));

  const local = (e: React.PointerEvent) => {
    const r = elRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const p = local(e);
    if (pointers.current.size === 1) gesture.current = { startX: p.x, startY: p.y, t: Date.now(), moved: false };
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.pinchZoom = view.zoom;
      gesture.current.moved = true;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2 && gesture.current.pinchDist) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAround(gesture.current.pinchZoom! + Math.log2(d / gesture.current.pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!gesture.current.moved && Math.hypot(p.x - gesture.current.startX, p.y - gesture.current.startY) > 6) {
      gesture.current.moved = true;
      cbs.current.onUserPan?.();
    }
    if (gesture.current.moved) {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      setView((v) => ({ ...v, lat: invMercY(mercY(v.lat, v.zoom) - dy, v.zoom), lng: invMercX(mercX(v.lng, v.zoom) - dx, v.zoom) }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (g && !g.moved && Date.now() - g.t < 500) {
        const p = local(e);
        const [lat, lng] = state.unproject(p.x, p.y);
        cbs.current.onTap?.(lat, lng);
      }
      gesture.current = null;
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = elRef.current!.getBoundingClientRect();
    zoomAround(view.zoom - e.deltaY * 0.0025, e.clientX - r.left, e.clientY - r.top);
  };

  return (
    <>
      <div ref={elRef} className="schematic" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
        role="application" aria-label="map">
        <svg width={w} height={h} style={{ display: "block" }} aria-hidden>
          <rect width={w} height={h} fill="var(--map-bg)" />
          {w > 0 && (props.decorLines ?? []).map((d, i) => (
            <polyline key={i} points={d.path.map(([la, ln]) => { const p = state.project(la, ln); return `${p.x},${p.y}`; }).join(" ")}
              fill="none" stroke="var(--map-line)" strokeWidth={Math.max(3, d.widthM / state.mpp)} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
        <div className="schematic__badge">{props.labels.schematic}</div>
      </div>
      <div className="map-overlay">{w > 0 && props.children?.(state)}</div>
      <Controls state={state} props={props} zoomBy={zoomBy} />
    </>
  );
}
