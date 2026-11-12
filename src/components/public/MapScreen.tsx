"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapView, type MapHandle, type MapViewState } from "@/components/map/MapView";
import { Landmarks, StallMarkers, UserLocation, useLayout, type MarkerState } from "@/components/map/layers";
import { locationGranted, useGeolocation } from "@/components/map/useGeolocation";
import { fmt, type Messages } from "@/lib/i18n";
import { pick } from "@/lib/i18n/config";
import type { DisplayLine, Reference, StallCard } from "@/lib/domain/types";
import { effectiveHours, isOpenNow } from "@/lib/domain/hours";
import { minKnownPrice, won } from "@/lib/domain/price";
import { hintText, itemName, photoUrl, priceText, stallTitle } from "@/lib/domain/display";
import { IconChevronDown, IconChevronRight, IconImage, IconStore, IconX, Star } from "@/components/ui/icons";
import { RankingTicker } from "./RankingTicker";
import { postJson } from "./api";

type Filters = { open: boolean; priceMax: number | null; halal: boolean; card: boolean; category: string | null; subs: string[] };
const NO_FILTERS: Filters = { open: false, priceMax: null, halal: false, card: false, category: null, subs: [] };
const PRICE_STEPS = [3000, 5000, 10000];

export function MapScreen(props: {
  locale: string; t: Messages; reference: Reference; initialStalls: StallCard[]; initialLines: DisplayLine[]; ranking: StallCard[];
  mapsKey?: string; mapId?: string;
}) {
  const { locale, t, reference } = props;
  const router = useRouter();
  const params = useSearchParams();
  const mapRef = useRef<MapHandle>(null);
  const [stalls, setStalls] = useState<Map<string, StallCard>>(() => new Map(props.initialStalls.map((s) => [s.id, s])));
  const [lines, setLines] = useState<Map<string, DisplayLine>>(() => new Map(props.initialLines.map((l) => [l.id, l])));
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(params.get("s"));
  const [priceOpen, setPriceOpen] = useState<{ left: number; top: number } | null>(null);
  const [wantVisited, setWantVisited] = useState(false);
  const [locPrompt, setLocPrompt] = useState(false);
  const [visited, setVisited] = useState<StallCard[] | null>(null);
  const [search, setSearch] = useState<{ q: string; foods: { code: string; name_i18n: Record<string, string> }[]; ids: Set<string> } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const geo = useGeolocation();
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);

  const catColor = useMemo(() => new Map(reference.categories.map((c) => [c.code, `var(--c-${c.code}, ${c.color})`])), [reference.categories]);
  const stallList = useMemo(() => [...stalls.values()], [stalls]);
  const lineList = useMemo(() => [...lines.values()], [lines]);
  const selected = selectedSlug ? stallList.find((s) => s.slug === selectedSlug) ?? null : null;

  // ── data loading by viewport (§130: bounded queries only) ──
  const loadViewport = useCallback((b: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
    const l = loaded.current;
    if (l && b.minLat >= l.minLat && b.maxLat <= l.maxLat && b.minLng >= l.minLng && b.maxLng <= l.maxLng) return;
    const padLat = (b.maxLat - b.minLat) * 0.5, padLng = (b.maxLng - b.minLng) * 0.5;
    const req = { min_lat: b.minLat - padLat, min_lng: b.minLng - padLng, max_lat: b.maxLat + padLat, max_lng: b.maxLng + padLng };
    if (req.max_lat - req.min_lat > 0.029 || req.max_lng - req.min_lng > 0.034) return; // zoomed too far out
    postJson<{ stalls: StallCard[]; lines: DisplayLine[] }>("/api/public/map", req).then((d) => {
      loaded.current = { minLat: req.min_lat, minLng: req.min_lng, maxLat: req.max_lat, maxLng: req.max_lng };
      setStalls((cur) => { const n = new Map(cur); d.stalls.forEach((s) => n.set(s.id, s)); return n; });
      setLines((cur) => { const n = new Map(cur); d.lines.forEach((x) => n.set(x.id, x)); return n; });
    }).catch(() => {});
  }, []);

  const onViewChange = useCallback(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => { const b = mapRef.current?.bounds(); if (b) loadViewport(b); }, 350);
  }, [loadViewport]);

  // ── search (?q=) ──
  useEffect(() => {
    const q = params.get("q");
    if (!q) { setSearch(null); return; }
    postJson<{ stalls: StallCard[]; foods: { code: string; name_i18n: Record<string, string> }[] }>("/api/public/search", { q }).then((d) => {
      setStalls((cur) => { const n = new Map(cur); d.stalls.forEach((s) => n.set(s.id, s)); return n; });
      setSearch({ q, foods: d.foods, ids: new Set(d.stalls.map((s) => s.id)) });
    }).catch(() => setSearch({ q, foods: [], ids: new Set() }));
  }, [params]);

  // "Rate a stall you visited": GPS proposes nearest candidates, the user chooses (§59)
  useEffect(() => {
    if (!wantVisited || !geo.pos) return;
    setWantVisited(false);
    postJson<StallCard[]>("/api/public/nearby", { lat: geo.pos.lat, lng: geo.pos.lng }).then(setVisited).catch(() => setVisited([]));
  }, [wantVisited, geo.pos]);

  // ── follow mode ──
  useEffect(() => {
    if (geo.pos && geo.follow) mapRef.current?.panTo(geo.pos.lat, geo.pos.lng);
  }, [geo.pos, geo.follow]);
  useEffect(() => { if (geo.error === "denied") setToast(t.map.locationDenied); }, [geo.error, t.map.locationDenied]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3500); return () => clearTimeout(id); }, [toast]);

  const onLocate = async () => {
    if (geo.pos) { geo.setFollow(true); mapRef.current?.panTo(geo.pos.lat, geo.pos.lng); return; }
    if (await locationGranted()) geo.start();
    else setLocPrompt(true);
  };

  // ── filters ──
  const filterActive = filters.open || filters.priceMax != null || filters.halal || filters.card || !!filters.category || !!search;
  const matches = useCallback((s: StallCard): boolean => {
    if (search && !search.ids.has(s.id)) return false;
    if (filters.category && s.category_code !== filters.category) return false;
    if (filters.category && filters.subs.length && !s.items.some((i) => i.sub && filters.subs.includes(i.sub))) return false;
    if (filters.open && !isOpenNow(effectiveHours(s.hours_mode, s.hours, reference.default_hours))) return false;
    if (filters.priceMax != null) {
      const prices = s.items.map((i) => minKnownPrice(i.price)).filter((x): x is number => x != null);
      if (!prices.length || Math.min(...prices) > filters.priceMax) return false;
    }
    if (filters.halal && !s.halal) return false;
    if (filters.card && s.card !== true) return false;
    return true;
  }, [filters, search, reference.default_hours]);
  const matchCount = useMemo(() => stallList.filter(matches).length, [stallList, matches]);

  const select = (slug: string | null) => {
    setSelectedSlug(slug);
    const u = new URL(window.location.href);
    if (slug) u.searchParams.set("s", slug); else u.searchParams.delete("s");
    window.history.replaceState(null, "", u.toString());
  };

  const subcats = filters.category ? reference.subcategories.filter((s) => s.category_code === filters.category) : [];
  const labels = { zoomIn: t.map.zoomIn, zoomOut: t.map.zoomOut, locate: t.map.locate, schematic: t.map.schematic };

  return (
    <>
      <RankingTicker items={props.ranking} locale={locale} t={t} />
      <div className="filters">
        <div className="chiprow" role="group">
          <button className="chip" aria-pressed={filters.open} onClick={() => setFilters((f) => ({ ...f, open: !f.open }))}>{t.filters.open}</button>
          <div style={{ position: "relative", flex: "none" }}>
            <button className="chip" aria-pressed={filters.priceMax != null} aria-haspopup="menu" aria-expanded={!!priceOpen}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPriceOpen((v) => (v ? null : { left: r.left, top: r.bottom + 6 })); }}>
              {filters.priceMax != null ? fmt(t.filters.priceUnder, { p: won(filters.priceMax) }) : t.filters.price}<IconChevronDown size={14} />
            </button>
          </div>
          <button className="chip" aria-pressed={filters.halal} onClick={() => setFilters((f) => ({ ...f, halal: !f.halal }))}>{t.filters.halal}</button>
          <button className="chip" aria-pressed={filters.card} onClick={() => setFilters((f) => ({ ...f, card: !f.card }))}>{t.filters.card}</button>
        </div>
        <div className="chiprow chiprow--cats" role="group">
          {reference.categories.map((c) => (
            <button key={c.code} className="chip chip--cat" style={{ ["--cat" as string]: catColor.get(c.code) }} aria-pressed={filters.category === c.code}
              onClick={() => setFilters((f) => ({ ...f, category: f.category === c.code ? null : c.code, subs: [] }))}>
              {pick(c.name_i18n, locale)}
            </button>
          ))}
        </div>
        {subcats.length > 0 && (
          <div className="chiprow" role="group">
            {subcats.map((s) => (
              <button key={s.code} className="chip chip--sm" aria-pressed={filters.subs.includes(s.code)}
                onClick={() => setFilters((f) => ({ ...f, subs: f.subs.includes(s.code) ? f.subs.filter((x) => x !== s.code) : [...f.subs, s.code] }))}>
                {pick(s.name_i18n, locale)}
              </button>
            ))}
          </div>
        )}
      </div>
      {priceOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setPriceOpen(null)} />
          <div className="popover" role="menu" style={{ left: priceOpen.left, top: priceOpen.top, position: "fixed" }}>
            <button role="menuitemradio" aria-checked={filters.priceMax == null} aria-pressed={filters.priceMax == null}
              onClick={() => { setFilters((f) => ({ ...f, priceMax: null })); setPriceOpen(null); }}>{t.filters.priceAny}</button>
            {PRICE_STEPS.map((p) => (
              <button key={p} role="menuitemradio" aria-checked={filters.priceMax === p} aria-pressed={filters.priceMax === p}
                onClick={() => { setFilters((f) => ({ ...f, priceMax: p })); setPriceOpen(null); }}>{fmt(t.filters.priceUnder, { p: won(p) })}</button>
            ))}
          </div>
        </>
      )}

      <MapView ref={mapRef} center={selected ? [selected.lat, selected.lng] : [reference.area.center_lat, reference.area.center_lng]} zoom={reference.area.default_zoom}
        apiKey={props.mapsKey} mapId={props.mapId} labels={labels} onViewChange={onViewChange}
        onUserPan={() => geo.setFollow(false)} onTap={() => select(null)} onLocate={onLocate} locateActive={geo.follow}
        decorLines={lineList.map((l) => l.path)}>
        {(view) => (
          <MapLayers view={view} t={t} locale={locale} landmarks={reference.landmarks} stalls={stallList} lines={lineList} catColor={catColor} selected={selected}
            stateOf={(s) => (selected?.id === s.id ? "selected" : filterActive ? (matches(s) ? "match" : "muted") : "default")}
            onSelect={(s) => select(s.slug)} userPos={geo.pos} />
        )}
      </MapView>
      {filterActive && matchCount === 0 && <div className="mapnote" role="status" style={{ top: "auto", bottom: 150 }}>{t.map.noResults}</div>}

      <div className="sheet">
        <span className="sheet__handle" aria-hidden />
        {selected ? (
          <SelectedSheet s={selected} locale={locale} t={t} defaults={reference.default_hours} />
        ) : search ? (
          <SearchSheet search={search} stalls={stallList.filter((s) => search.ids.has(s.id))} locale={locale} t={t}
            onPick={(s) => { select(s.slug); mapRef.current?.panTo(s.lat, s.lng, 18); }} onClose={() => router.replace(`/${locale}`)} />
        ) : (
          <div className="sheet__summary">
            <span>{fmt(t.map.stallsShown, { n: filterActive ? matchCount : stallList.length })}</span>
            <button className="linkbtn" onClick={async () => {
              setWantVisited(true);
              if (!geo.pos) { if (await locationGranted()) geo.start(); else setLocPrompt(true); }
            }}>{t.map.visited}</button>
          </div>
        )}
      </div>

      {locPrompt && (
        <>
          <div className="backdrop" onClick={() => { setLocPrompt(false); setWantVisited(false); }} />
          <div className="sheet sheet--overlay" role="dialog" aria-modal="true">
            <span className="sheet__handle" aria-hidden />
            <p style={{ margin: "4px 0 16px" }}>{t.map.locationWhy}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn--outline" style={{ flex: 1 }} onClick={() => { setLocPrompt(false); setWantVisited(false); }}>{t.common.cancel}</button>
              <button className="btn btn--primary" style={{ flex: 2 }} onClick={() => { setLocPrompt(false); geo.start(); }}>{t.map.allow}</button>
            </div>
          </div>
        </>
      )}

      {visited && (
        <>
          <div className="backdrop" onClick={() => setVisited(null)} />
          <div className="sheet sheet--overlay" role="dialog" aria-modal="true" aria-label={t.map.whichStall}>
            <span className="sheet__handle" aria-hidden />
            <h2 className="section__title">{t.map.whichStall}</h2>
            {visited.length === 0 && <p className="muted">{t.map.noneNearby}</p>}
            <ul className="list">
              {visited.map((s) => (
                <li key={s.id}>
                  <Link className="row" href={`/${locale}/stalls/${s.slug}#review`}>
                    <span className="chip__swatch" style={{ ["--cat" as string]: catColor.get(s.category_code) }} />
                    <span className="ellipsis" style={{ flex: 1 }}><b>{stallTitle(s, locale)}</b> <span className="muted">{hintText(s.hint, locale, t)}</span></span>
                    <span className="muted small">{fmt(t.map.away, { n: s.distance_m ?? 0 })}</span>
                    <IconChevronRight size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function MapLayers({ view, t, locale, landmarks, stalls, lines, catColor, selected, stateOf, onSelect, userPos }: {
  view: MapViewState; t: Messages; locale: string; landmarks: Reference["landmarks"]; stalls: StallCard[]; lines: DisplayLine[]; catColor: Map<string, string>;
  selected: StallCard | null; stateOf: (s: StallCard) => MarkerState; onSelect: (s: StallCard) => void;
  userPos: { lat: number; lng: number; accuracy: number; heading: number | null } | null;
}) {
  const byId = useMemo(() => new Map(stalls.map((s) => [s.id, s])), [stalls]);
  const items = useMemo(() => stalls.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, line_id: s.line_id, progress: s.progress })), [stalls]);
  const placed = useLayout(view, items, lines);
  const sel = selected ? placed.get(selected.id) : null;
  const img = selected ? photoUrl(selected.photo) : null;
  return (
    <>
      <Landmarks view={view} landmarks={landmarks} locale={locale} />
      <StallMarkers view={view} placed={placed} colorOf={(id) => catColor.get(byId.get(id)?.category_code ?? "") ?? "#999"}
        stateOf={(id) => stateOf(byId.get(id)!)} onSelect={(id) => onSelect(byId.get(id)!)}
        ariaLabelOf={(id) => { const s = byId.get(id)!; return `${stallTitle(s, locale)} ${hintText(s.hint, locale, t)}`; }} />
      <UserLocation view={view} pos={userPos} />
      {selected && sel && (
        <Link href={`/${locale}/stalls/${selected.slug}`} className="callout" style={{ left: sel.x, top: sel.y - Math.max(sel.size * 1.45, 16) / 2 }}>
          <Thumb className="callout__img" src={img} color={catColor.get(selected.category_code)} size={18} />
          <span className="callout__name ellipsis">{stallTitle(selected, locale)}</span>
          {hintText(selected.hint, locale, t) && <span className="callout__hint ellipsis">{hintText(selected.hint, locale, t)}</span>}
          <IconChevronRight size={16} strokeWidth={2.2} />
        </Link>
      )}
    </>
  );
}

function SelectedSheet({ s, locale, t, defaults }: { s: StallCard; locale: string; t: Messages; defaults: Reference["default_hours"] }) {
  const rep = s.items.find((i) => i.rep) ?? s.items[0];
  const others = s.items.filter((i) => i !== rep);
  const img = photoUrl(s.photo);
  const hint = hintText(s.hint, locale, t);
  return (
    <div className="sel">
      <Thumb className="sel__img" src={img} color={`var(--c-${s.category_code})`} size={30} />
      <div className="sel__body">
        <div className="sel__top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sel__name"><span className="sel__title">{stallTitle(s, locale)}</span>{hint && <span className="sel__hint"> · {hint}</span>}</div>
            <div className="sel__rating">
              {s.rating.count > 0 ? (<><Star size={17} />{s.rating.avg?.toFixed(1)} <span className="muted">({s.rating.count})</span></>) : null}
            </div>
          </div>
          <Link href={`/${locale}/stalls/${s.slug}`} className="btn-outline">{t.stall.details}<IconChevronRight size={16} strokeWidth={2.2} /></Link>
        </div>
        {rep && (
          <div className="sel__menu">
            <div className="sel__row"><span className="tag">{t.stall.repMenu}</span><span className="ellipsis">{itemName(rep, locale)}</span><span className="sel__price">{priceText(rep.price, t)}</span></div>
            {others.length > 0 && (
              <div className="sel__row"><span className="tag">{t.stall.otherMenu}</span>
                <span className="ellipsis">{others.length > 2 ? fmt(t.stall.others, { list: others.slice(0, 2).map((i) => itemName(i, locale)).join(", ") }) : others.map((i) => itemName(i, locale)).join(", ")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Photo thumbnail; when no photo exists yet, a small neutral tile keeps the mockup layout (never a large empty placeholder). */
function Thumb({ src, className, color, size }: { src: string | null; className: string; color?: string; size: number }) {
  if (src) return <img className={className} src={src} alt="" />;
  return (
    <span className={className} aria-hidden style={{ background: `color-mix(in srgb, ${color ?? "var(--muted)"} 12%, var(--surface-2))`, color: color ?? "var(--muted)" }}>
      <IconStore size={size} />
    </span>
  );
}

function SearchSheet({ search, stalls, locale, t, onPick, onClose }: {
  search: { q: string; foods: { code: string; name_i18n: Record<string, string> }[] }; stalls: StallCard[]; locale: string; t: Messages;
  onPick: (s: StallCard) => void; onClose: () => void;
}) {
  return (
    <div style={{ maxHeight: "36dvh", overflowY: "auto" }}>
      <div className="sheet__summary">
        <b>“{search.q}”</b>
        <button className="header__btn" onClick={onClose} aria-label={t.nav.close}><IconX size={18} /></button>
      </div>
      {search.foods.length > 0 && (
        <div className="chiprow" style={{ padding: "4px 0 8px" }}>
          {search.foods.map((f) => <Link key={f.code} className="chip chip--sm" href={`/${locale}/food/${f.code}`}>{pick(f.name_i18n, locale)}</Link>)}
        </div>
      )}
      {stalls.length === 0 && <p className="muted small">{t.search.empty}</p>}
      <ul className="list">
        {stalls.map((s) => (
          <li key={s.id}>
            <button className="row" style={{ width: "100%", textAlign: "left" }} onClick={() => onPick(s)}>
              <IconImage size={18} className="muted" />
              <span className="ellipsis" style={{ flex: 1 }}><b>{stallTitle(s, locale)}</b> <span className="muted small">{hintText(s.hint, locale, t)}</span></span>
              <IconChevronRight size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
