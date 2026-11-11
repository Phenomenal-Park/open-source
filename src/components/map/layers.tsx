"use client";
import { useMemo, type ReactNode } from "react";
import { layoutMarkers, type LayoutInput, type LayoutLine, type Placed } from "@/lib/map/layout";
import { pick } from "@/lib/i18n/config";
import type { Landmark } from "@/lib/domain/types";
import { IconBag } from "@/components/ui/icons";
import type { MapViewState } from "./MapView";

export type MarkerState = "default" | "muted" | "match" | "selected";

export function useLayout(view: MapViewState, items: LayoutInput[], lines: LayoutLine[]): Map<string, Placed> {
  return useMemo(() => {
    const placed = layoutMarkers(items, lines, view.project, view.zoom);
    return new Map(placed.map((p) => [p.id, p]));
    // view.version changes on every pan/zoom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.version, items, lines]);
}

export function StallMarkers({
  view, placed, colorOf, stateOf, onSelect, ariaLabelOf,
}: {
  view: MapViewState;
  placed: Map<string, Placed>;
  colorOf: (id: string) => string;
  stateOf: (id: string) => MarkerState;
  onSelect: (id: string) => void;
  ariaLabelOf?: (id: string) => string;
}) {
  const nodes: ReactNode[] = [];
  for (const [id, p] of placed) {
    if (p.x < -30 || p.y < -30 || p.x > view.width + 30 || p.y > view.height + 30) continue;
    const st = stateOf(id);
    const s = st === "selected" ? Math.max(p.size * 1.45, 16) : st === "match" ? p.size * 1.12 : p.size;
    nodes.push(
      <button key={id} className="marker" data-state={st} aria-label={ariaLabelOf?.(id) ?? id}
        style={{ left: p.x, top: p.y, width: s, height: s, ["--cat" as string]: colorOf(id) }}
        onClick={(e) => { e.stopPropagation(); onSelect(id); }}
        onPointerDown={(e) => e.stopPropagation()} />,
    );
  }
  return <>{nodes}</>;
}

/** Major landmarks stay readable (§37); minor ones appear only when zoomed in. */
export function Landmarks({ view, landmarks, locale }: { view: MapViewState; landmarks: Landmark[]; locale: string }) {
  return (
    <>
      {landmarks.map((l) => {
        if (l.priority > (view.zoom >= 18 ? 5 : view.zoom >= 17 ? 2 : 1)) return null;
        const p = view.project(l.lat, l.lng);
        if (p.x < -60 || p.y < -30 || p.x > view.width + 60 || p.y > view.height + 30) return null;
        const name = pick(l.name_i18n, locale);
        if (l.kind === "station") {
          const m = /^(.*?)\s*[（(](.*)[)）]$/.exec(name);
          const line = /(\d)/.exec(m?.[2] ?? "")?.[1];
          return (
            <div key={l.code} className="landmark landmark--station" style={{ left: p.x, top: p.y }}>
              {line && <span className="landmark__line">{line}</span>}
              <span>{m ? `${m[1]}\n(${m[2]})` : name}</span>
            </div>
          );
        }
        if (l.kind === "exit" || l.kind === "direction") {
          return <div key={l.code} className="landmark landmark--direction" style={{ left: p.x, top: p.y }}>{name}</div>;
        }
        return (
          <div key={l.code} className="landmark" style={{ left: p.x, top: p.y }}>
            <IconBag size={20} className="landmark__icon" />
            {name.replace(/\s(?=\S+$)/, "\n")}
          </div>
        );
      })}
    </>
  );
}

export function UserLocation({ view, pos }: { view: MapViewState; pos: { lat: number; lng: number; accuracy: number; heading: number | null } | null }) {
  if (!pos) return null;
  const p = view.project(pos.lat, pos.lng);
  const r = Math.min(400, pos.accuracy / view.mpp);
  return (
    <>
      {r > 10 && <div className="useracc" style={{ left: p.x, top: p.y, width: r * 2, height: r * 2 }} />}
      {pos.heading != null && (
        <div className="userhead" style={{ left: p.x - 7, top: p.y - 22, transform: `rotate(${pos.heading}deg)` }} />
      )}
      <div className="userdot" style={{ left: p.x, top: p.y }} />
    </>
  );
}
