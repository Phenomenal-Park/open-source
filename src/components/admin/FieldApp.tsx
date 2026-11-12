"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapView, type MapHandle, type MapViewState } from "@/components/map/MapView";
import { StallMarkers, UserLocation, useLayout } from "@/components/map/layers";
import { useGeolocation } from "@/components/map/useGeolocation";
import { AREA_DEFAULT_HOURS, type DayHours } from "@/lib/domain/hours";
import { offsetPath, type LayoutLine } from "@/lib/map/layout";
import { streetDecor } from "@/lib/domain/types";
import { IconArrowRight, IconBag, IconBack, IconChevronDown, IconClock, IconInfo, IconPin, IconRefresh, IconX } from "@/components/ui/icons";
import { AdminHeader } from "./AdminHeader";
import { adminCall, errorText, newRequestId } from "./api";
import {
  CATEGORY_OPTS, CategoryPicker, categoryColor, defaultRows, HintField, hintToPayload, HoursEditor, MenuRowsEditor, nearestLandmarks, rowsToItems,
  type HintValue, type HoursValue, type LandmarkOpt, type MenuRow,
} from "./editors";

type FieldSpot = {
  id: string; m_number: number; status: string; raw_lat: number; raw_lng: number; display_line_id: string | null; display_progress: number | null;
  display_lat: number | null; display_lng: number | null; o_number: number | null; category_code: string | null; stall_id: string | null; rep_name: string | null;
};
type FieldLine = {
  id: string; name: string; path: [number, number][]; is_active: boolean;
  street_group: string | null; side: "left" | "right" | null; center_path: [number, number][] | null; width_m: number | null;
};
/** Line being edited. kind "street" = centre line + width → both sidewalk edges; "line" = a single sidewalk edge. */
type EditLine = { kind: "street" | "line"; id: string | null; group: string | null; name: string; path: [number, number][]; width: number };
const DEFAULT_STREET_WIDTH = 14;
type FieldMapData = {
  area: { center_lat: number; center_lng: number; default_zoom: number };
  default_hours: DayHours[];
  landmarks: { id: string; code: string; name_i18n: Record<string, string>; short_i18n: Record<string, string>; lat: number; lng: number; kind: string; priority: number }[];
  lines: FieldLine[]; spots: FieldSpot[];
};
type Status = { spot_count: number; next_m: number; route_id: string | null; route_length: number; role: string };
type RouteItem = {
  o_number: number; spot_id: string; m_number: number; status: string; lat: number; lng: number; hint_landmark_id: string | null;
  stall_id: string | null; category_code: string | null; rep_name: string | null; last_observation: { result: string; observed_at: string } | null;
};
type Mode = "register" | "patrol" | "lines";
type Nearby = { spot_id: string; m_number: number; distance_m: number; category_code: string | null; rep_name: string | null };

export const mLabel = (n: number) => `M-${String(n).padStart(3, "0")}`;
export const oLabel = (n: number) => `O-${String(n).padStart(3, "0")}`;
const MODE_LABEL: Record<Mode, string> = { register: "현장 등록", patrol: "순찰", lines: "표시선" };
const OBS_LABEL: Record<string, string> = { INITIAL: "최초 등록", SAME: "그대로", CHANGED: "변경", NO_STALL: "오늘 없음", UNCERTAIN: "확인 어려움" };

function store<T>(k: string, v?: T): T | null {
  try {
    if (v !== undefined) { localStorage.setItem(k, JSON.stringify(v)); return v; }
    const r = localStorage.getItem(k);
    return r ? (JSON.parse(r) as T) : null;
  } catch { return null; }
}

export function FieldApp({ mapsKey, mapId }: { mapsKey?: string; mapId?: string }) {
  const mapRef = useRef<MapHandle>(null);
  const [data, setData] = useState<FieldMapData | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setModeState] = useState<Mode>("register");
  const [modeMenu, setModeMenu] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const geo = useGeolocation();

  // registration draft
  const [candidate, setCandidate] = useState<{ lat: number; lng: number } | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [rows, setRows] = useState<MenuRow[]>(() => defaultRows());
  const [hint, setHint] = useState<HintValue>({ landmark_id: null, text: "" });
  const [hours, setHours] = useState<HoursValue>({ mode: "DEFAULT" });
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [nearbyAck, setNearbyAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const reqId = useRef<string>(newRequestId());
  const [insertAfter, setInsertAfter] = useState<string | null>(null);

  // patrol
  const [route, setRoute] = useState<RouteItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [changeOpen, setChangeOpen] = useState(false);
  const [spotInfo, setSpotInfo] = useState<FieldSpot | null>(null);
  const [pendingPatrolSpot, setPendingPatrolSpot] = useState<string | null>(null);

  // lines
  const [editLine, setEditLine] = useState<EditLine | null>(null);

  const showToast = (text: string, error = false) => setToast({ text, error });
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), toast.error ? 4500 : 1800); return () => clearTimeout(id); }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([adminCall<FieldMapData>("field_map"), adminCall<Status>("field_status")]);
      setData(m); setStatus(s); setLoadError(null);
    } catch (e) { setLoadError(errorText(e)); }
  }, []);
  const loadRoute = useCallback(async () => {
    try { const r = await adminCall<{ items: RouteItem[] }>("field_route", {}); setRoute(r.items); } catch (e) { showToast(errorText(e), true); }
  }, []);

  useEffect(() => {
    refresh();
    const m = store<Mode>("msm_field_mode");
    if (m) setModeState(m);
    setIdx(store<number>("msm_patrol_idx") ?? 0);
  }, [refresh]);
  useEffect(() => { if (mode === "patrol") loadRoute(); }, [mode, loadRoute]);
  useEffect(() => { if (geo.pos && geo.follow) mapRef.current?.panTo(geo.pos.lat, geo.pos.lng); }, [geo.pos, geo.follow]);

  const setMode = (m: Mode) => { setModeState(m); store("msm_field_mode", m); setModeMenu(false); cancelCandidate(); setEditLine(null); setSpotInfo(null); };
  const setPatrolIdx = (i: number) => { setIdx(i); store("msm_patrol_idx", i); };

  const landmarkOpts: LandmarkOpt[] = useMemo(() => (data?.landmarks ?? []).map((l) => ({ id: l.id, short: l.short_i18n.ko || l.name_i18n.ko, lat: l.lat, lng: l.lng })), [data]);
  const defaults = data?.default_hours?.length === 7 ? data.default_hours : AREA_DEFAULT_HOURS;

  // ── registration ──
  function resetDraft() {
    setCategory(null); setRows(defaultRows()); setHint({ landmark_id: null, text: "" }); setHours({ mode: "DEFAULT" });
    setNearby([]); setNearbyAck(false); reqId.current = newRequestId(); setInsertAfter(null);
  }
  function cancelCandidate() { setCandidate(null); resetDraft(); } // nothing is persisted, no M number consumed (§74)

  const placeCandidate = (lat: number, lng: number) => {
    const first = !candidate;
    setCandidate({ lat, lng });
    if (first) {
      const near = nearestLandmarks(landmarkOpts, { lat, lng }, 1)[0];
      setHint(near && !hint.text ? { landmark_id: near.id, text: "" } : hint);
    }
  };

  // nearby-duplicate check (§80), debounced while the candidate is adjusted
  useEffect(() => {
    if (!candidate) return;
    const id = setTimeout(async () => {
      try {
        const r = await adminCall<Nearby[]>("field_nearby_spots", { p_lat: candidate.lat, p_lng: candidate.lng, p_radius: 8 });
        setNearby(r); if (!r.length) setNearbyAck(false);
      } catch { /* non-blocking */ }
    }, 250);
    return () => clearTimeout(id);
  }, [candidate]);

  const save = async () => {
    if (!candidate || !category || saving) return;
    setSaving(true);
    try {
      const r = await adminCall<{ m_number: number; o_number: number; replayed?: boolean }>("field_create_spot", {
        p: {
          client_request_id: reqId.current, lat: candidate.lat, lng: candidate.lng, category_code: category,
          items: rowsToItems(rows), hint: hintToPayload(hint),
          hours: hours.mode === "CUSTOM" ? { mode: "CUSTOM", days: hours.days } : null, insert_after_spot_id: insertAfter,
        },
      });
      showToast(`${mLabel(r.m_number)} 저장됨`);
      setCandidate(null); resetDraft();
      refresh();
    } catch (e) {
      showToast(errorText(e), true); // keep the draft + same request id → safe retry
    } finally { setSaving(false); }
  };

  // ── patrol ──
  const current = route[Math.min(idx, Math.max(0, route.length - 1))];
  useEffect(() => { if (mode === "patrol" && current && !geo.follow) mapRef.current?.panTo(current.lat, current.lng); }, [mode, current, geo.follow]);
  const [patrolBusy, setPatrolBusy] = useState(false);
  const record = async (result: "SAME" | "NO_STALL" | "UNCERTAIN") => {
    if (!current || patrolBusy) return;
    setPatrolBusy(true);
    try {
      await adminCall("field_record_observation", { p: { client_request_id: newRequestId(), spot_id: current.spot_id, result, route_id: status?.route_id } });
      showToast(`${oLabel(current.o_number)} ${OBS_LABEL[result]}`);
      setRoute((r) => r.map((x) => (x.spot_id === current.spot_id ? { ...x, last_observation: { result, observed_at: new Date().toISOString() } } : x)));
      if (idx < route.length - 1) setPatrolIdx(idx + 1); // auto-advance (§101)
    } catch (e) { showToast(errorText(e), true); } finally { setPatrolBusy(false); }
  };

  useEffect(() => {
    if (!pendingPatrolSpot || !route.length) return;
    const i = route.findIndex((r) => r.spot_id === pendingPatrolSpot);
    if (i >= 0) setPatrolIdx(i);
    setPendingPatrolSpot(null);
  }, [route, pendingPatrolSpot]);

  // ── map interactions ──
  const onTap = (lat: number, lng: number) => {
    if (mode === "register") { setSpotInfo(null); placeCandidate(lat, lng); }
    else if (mode === "lines" && editLine) setEditLine({ ...editLine, path: [...editLine.path, [lat, lng]] });
  };
  const onMarker = (id: string) => {
    const s = data?.spots.find((x) => x.id === id);
    if (!s) return;
    if (mode === "patrol") { const i = route.findIndex((r) => r.spot_id === id); if (i >= 0) setPatrolIdx(i); return; }
    if (mode === "register" && !candidate) setSpotInfo(s);
  };

  const spots = data?.spots ?? [];
  const lines: LayoutLine[] = useMemo(() => (data?.lines ?? []).filter((l) => l.is_active).map((l) => ({ id: l.id, path: l.path, outward: l.side === "left" ? 1 : l.side === "right" ? -1 : 0, roadWidthM: l.width_m, group: l.street_group, centerPath: l.center_path })), [data]);
  // Register/patrol show RAW positions (field truth); lines mode previews the public magnetic layout.
  const items = useMemo(() => spots.map((s) => mode === "lines"
    ? { id: s.id, lat: s.display_lat ?? s.raw_lat, lng: s.display_lng ?? s.raw_lng, line_id: s.display_line_id, progress: s.display_progress }
    : { id: s.id, lat: s.raw_lat, lng: s.raw_lng, line_id: null, progress: null }), [spots, mode]);

  const nextM = status?.next_m ?? 1;
  const sheetOpen = (mode === "register" && !!candidate) || mode === "patrol" || mode === "lines" || !!spotInfo;

  if (loadError && !data) {
    return (
      <div className="app"><AdminHeader /><main className="page"><p role="alert" style={{ marginTop: 20 }}>{loadError}</p>
        <button className="btn btn--outline" onClick={refresh}><IconRefresh size={18} />다시 시도</button></main></div>
    );
  }

  return (
    <div className="app app--map">
      <AdminHeader badge={
        <span style={{ position: "relative", display: "inline-block" }}>
          <button className="tag" style={{ height: 32, background: "var(--accent-soft)", color: "var(--accent)", fontSize: 15, gap: 4 }}
            onClick={() => setModeMenu((v) => !v)} aria-haspopup="menu" aria-expanded={modeMenu}>
            {MODE_LABEL[mode]}<IconChevronDown size={14} />
          </button>
          {modeMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setModeMenu(false)} />
              <div className="popover" role="menu" style={{ left: 0, top: 38 }}>
                {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                  <button key={m} role="menuitemradio" aria-checked={mode === m} aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
                ))}
              </div>
            </>
          )}
        </span>
      } />

      {/* persistent compact status (§83) */}
      <div className="chiprow" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", flex: "none" }}>
        {mode === "patrol" ? (
          <>
            <span className="chip" style={{ fontWeight: 700, background: "var(--accent-soft)", borderColor: "transparent", color: "var(--accent)" }}>
              오늘 확인 {route.filter((r) => r.last_observation && new Date(r.last_observation.observed_at).toDateString() === new Date().toDateString() && r.last_observation.result !== "INITIAL").length} / {route.length}
            </span>
            <span className="chip"><IconBag size={16} />등록 {status?.spot_count ?? "–"}</span>
          </>
        ) : (
          <>
            <span className="chip chip--sm"><IconBag size={15} />등록 {status?.spot_count ?? "–"}</span>
            <span className="chip chip--sm" style={{ fontWeight: 700, background: "var(--accent-soft)", borderColor: "transparent", color: "var(--accent)" }}>
              <IconArrowRight size={15} />다음 {mLabel(nextM)}
            </span>
            <span className="chip chip--sm"><IconClock size={15} />{hours.mode === "DEFAULT" ? "기본 시간 적용" : "맞춤 시간"}</span>
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: sheetOpen ? "30dvh" : 0, display: "flex", flexDirection: "column", position: "relative" }}>
        <MapView ref={mapRef} center={data ? [data.area.center_lat, data.area.center_lng] : [37.5627, 126.985]} zoom={data?.area.default_zoom ?? 17}
          apiKey={mapsKey} mapId={mapId} onTap={onTap} onUserPan={() => geo.setFollow(false)}
          onLocate={() => { if (geo.pos) { geo.setFollow(true); mapRef.current?.panTo(geo.pos.lat, geo.pos.lng); } else geo.start(); }} locateActive={geo.follow}
          labels={{ zoomIn: "확대", zoomOut: "축소", locate: "내 위치", schematic: "지도 키 없음 · 간략 지도" }}
          decorLines={streetDecor(data?.lines ?? [])}>
          {(view) => (
            <FieldLayers view={view} items={items} lines={lines} spots={spots} mode={mode} candidate={candidate} nextM={nextM}
              currentSpotId={mode === "patrol" ? current?.spot_id ?? null : spotInfo?.id ?? null} onMarker={onMarker}
              onMoveCandidate={(lat, lng) => setCandidate({ lat, lng })} allLines={data?.lines ?? []} editLine={editLine}
              onEditLine={setEditLine} onPickLine={(l) => setEditLine(lineToEdit(l))} userPos={geo.pos} />
          )}
        </MapView>
      </div>

      {/* ── sheets ── */}
      {mode === "register" && !candidate && !spotInfo && (
        <div className="sheet" style={{ paddingTop: 12 }}>
          <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
            <IconInfo size={16} style={{ verticalAlign: "-3px" }} /> 지도의 빈 곳을 탭하면 <b>{mLabel(nextM)}</b> 등록을 시작해요.
          </p>
        </div>
      )}

      {mode === "register" && spotInfo && !candidate && (
        <div className="sheet">
          <span className="sheet__handle" aria-hidden />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="chip__swatch" style={{ ["--cat" as string]: categoryColor(spotInfo.category_code), width: 14, height: 14 }} />
            <b style={{ fontSize: 18 }}>{mLabel(spotInfo.m_number)}</b>
            <span className="ellipsis" style={{ flex: 1 }}>{spotInfo.rep_name ?? "메뉴 미입력"}{spotInfo.o_number ? ` · ${oLabel(spotInfo.o_number)}` : ""}</span>
            <button className="header__btn" onClick={() => setSpotInfo(null)} aria-label="닫기"><IconX /></button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {spotInfo.stall_id && <Link className="btn btn--outline" style={{ flex: 1, height: 42 }} href={`/admin/stalls/${spotInfo.stall_id}`}>정보 편집</Link>}
            <button className="btn btn--outline" style={{ flex: 1, height: 42 }} onClick={() => { setPendingPatrolSpot(spotInfo.id); setMode("patrol"); }}>순찰 기록</button>
            <button className="btn btn--outline" style={{ flex: 1, height: 42 }} onClick={() => { setInsertAfter(spotInfo.id); setSpotInfo(null); showToast(`다음 등록은 ${mLabel(spotInfo.m_number)} 다음 순서로 들어가요`); }}>이 다음에 추가</button>
          </div>
        </div>
      )}

      {mode === "register" && candidate && (
        <div className="sheet" style={{ maxHeight: "62dvh", overflowY: "auto", flex: "0 1 auto", minHeight: 0 }}>
          <span className="sheet__handle" aria-hidden />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="muted" style={{ fontWeight: 600 }}>시장 번호</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 14px", borderRadius: 12 }}>{mLabel(nextM)}</span>
            <span className="tag" style={{ marginLeft: "auto" }}>자동 부여</span>
          </div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            {candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)} · 마커를 끌거나 지도를 다시 탭해 위치 조정
            {insertAfter && <> · <b>지정 위치 다음 순서로 삽입</b></>}
          </p>

          {nearby.length > 0 && !nearbyAck && (
            <div className="card" role="alert" style={{ marginTop: 10, borderColor: "#f0c36d", background: "color-mix(in srgb, #f6b400 8%, var(--surface))" }}>
              <b>근처 등록 위치</b>
              {nearby.map((n) => (
                <div key={n.spot_id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span className="chip__swatch" style={{ ["--cat" as string]: categoryColor(n.category_code) }} />
                  <span style={{ flex: 1 }}>{mLabel(n.m_number)} · 약 {Math.round(n.distance_m)}m {n.rep_name ? `· ${n.rep_name}` : ""}</span>
                  <button className="btn btn--outline" style={{ height: 34, fontSize: 13, padding: "0 10px" }} onClick={() => {
                    const s = spots.find((x) => x.id === n.spot_id); cancelCandidate(); if (s) setSpotInfo(s);
                  }}>기존 위치 선택</button>
                </div>
              ))}
              <button className="btn btn--primary btn--block" style={{ height: 40, marginTop: 10, fontSize: 14 }} onClick={() => setNearbyAck(true)}>새 위치 등록</button>
            </div>
          )}

          <div className="field"><span className="field__label">카테고리 <span style={{ color: "var(--danger)" }}>*</span></span>
            <CategoryPicker value={category} onChange={setCategory} />
          </div>
          <div className="field">
            <span className="field__label" style={{ display: "flex", justifyContent: "space-between" }}>메뉴 및 가격 <span className="muted small" style={{ fontWeight: 400 }}>보이는 상품만 입력하세요</span></span>
            <MenuRowsEditor rows={rows} onChange={setRows} showSpice={category !== "fashion_goods"} />
          </div>
          <div className="field"><span className="field__label">랜드마크 설명</span>
            <HintField value={hint} onChange={setHint} landmarks={landmarkOpts} at={candidate} />
          </div>
          <div className="field"><span className="field__label">운영시간</span>
            <HoursEditor value={hours} onChange={setHours} defaults={defaults} />
          </div>
          {!category && <p className="small muted" style={{ textAlign: "right", margin: "10px 0 0" }}>카테고리를 선택하면 저장할 수 있어요</p>}
          <div className="sheet__actions">
            <button className="btn btn--outline" style={{ flex: 1 }} onClick={cancelCandidate}>취소</button>
            <button className="btn btn--primary" style={{ flex: 2 }} disabled={!category || saving || (nearby.length > 0 && !nearbyAck)} onClick={save}>
              {saving ? "저장 중…" : <>저장<IconArrowRight size={20} /></>}
            </button>
          </div>
        </div>
      )}

      {mode === "patrol" && (
        <div className="sheet">
          <span className="sheet__handle" aria-hidden />
          {!current ? (
            <p className="muted">순찰 경로가 비어 있어요. 먼저 현장 등록을 해 주세요.</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="header__btn" aria-label="이전" disabled={idx === 0} onClick={() => setPatrolIdx(Math.max(0, idx - 1))}><IconBack /></button>
                <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>{oLabel(current.o_number)} <span className="muted" style={{ fontSize: 16, fontWeight: 600 }}>/ {route.length}</span></div>
                  <div className="small muted">{mLabel(current.m_number)}{current.hint_landmark_id ? ` · ${landmarkOpts.find((l) => l.id === current.hint_landmark_id)?.short ?? ""} 근처` : ""}</div>
                </div>
                <button className="header__btn" aria-label="다음" disabled={idx >= route.length - 1} onClick={() => setPatrolIdx(Math.min(route.length - 1, idx + 1))}><IconArrowRight /></button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 12px" }}>
                <span className="tag">현재 등록</span>
                <span className="chip__swatch" style={{ ["--cat" as string]: categoryColor(current.category_code) }} />
                <b className="ellipsis" style={{ flex: 1 }}>{current.rep_name ?? (current.stall_id ? CATEGORY_OPTS.find((c) => c.code === current.category_code)?.name : "노점 없음")}</b>
                {current.last_observation && <span className="small muted">최근: {OBS_LABEL[current.last_observation.result]}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button className="btn btn--primary" style={{ height: 56 }} disabled={patrolBusy} onClick={() => record("SAME")}>그대로</button>
                <button className="btn btn--outline" style={{ height: 56 }} disabled={patrolBusy} onClick={() => setChangeOpen(true)}>변경</button>
                <button className="btn btn--outline" style={{ height: 56 }} disabled={patrolBusy} onClick={() => record("NO_STALL")}>오늘 없음</button>
                <button className="btn btn--outline" style={{ height: 56 }} disabled={patrolBusy} onClick={() => record("UNCERTAIN")}>확인 어려움</button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "lines" && (
        <LinesPanel lines={data?.lines ?? []} edit={editLine} setEdit={setEditLine}
          onSaved={() => { setEditLine(null); refresh(); showToast("표시선 저장됨 · 노점 위치 재계산"); }} onError={(e) => showToast(errorText(e), true)} />
      )}

      {changeOpen && current && (
        <ChangeSheet item={current} routeId={status?.route_id ?? null} defaults={defaults} landmarks={landmarkOpts}
          onClose={() => setChangeOpen(false)}
          onSaved={() => {
            setChangeOpen(false); showToast(`${oLabel(current.o_number)} 변경 저장됨`);
            loadRoute(); refresh();
            if (idx < route.length - 1) setPatrolIdx(idx + 1);
          }}
          onError={(e) => showToast(errorText(e), true)} />
      )}

      {toast && <div className={`toast ${toast.error ? "toast--error" : ""}`} role="status">{toast.text}</div>}
    </div>
  );
}

// ───────────── map layers for field mode ─────────────
function FieldLayers(p: {
  view: MapViewState; items: { id: string; lat: number; lng: number; line_id: string | null; progress: number | null }[]; lines: LayoutLine[];
  spots: FieldSpot[]; mode: Mode; candidate: { lat: number; lng: number } | null; nextM: number; currentSpotId: string | null;
  onMarker: (id: string) => void; onMoveCandidate: (lat: number, lng: number) => void;
  allLines: FieldLine[]; editLine: EditLine | null;
  onEditLine: (l: EditLine) => void; onPickLine: (l: FieldLine) => void;
  userPos: { lat: number; lng: number; accuracy: number; heading: number | null } | null;
}) {
  const { view } = p;
  const fieldState = (id: string) => (id === p.currentSpotId ? "selected" : p.mode === "patrol" ? "muted" : "default") as "selected" | "muted" | "default";
  const placed = useLayout(view, p.items, p.mode === "lines" ? p.lines : [], fieldState, `${p.currentSpotId}|${p.mode}`);
  const byId = useMemo(() => new Map(p.spots.map((s) => [s.id, s])), [p.spots]);
  const dragging = useRef<null | { kind: "cand" } | { kind: "vertex"; i: number }>(null);
  const rel = (e: React.PointerEvent) => {
    const r = (e.currentTarget.closest(".map-overlay") as HTMLElement).getBoundingClientRect();
    return view.unproject(e.clientX - r.left, e.clientY - r.top);
  };
  const cand = p.candidate ? view.project(p.candidate.lat, p.candidate.lng) : null;
  const toPts = (path: [number, number][]) => path.map(([a, b]) => { const q = view.project(a, b); return `${q.x},${q.y}`; }).join(" ");

  return (
    <>
      {p.mode === "lines" && (
        <svg width={view.width} height={view.height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {p.allLines.filter((l) => !(p.editLine && (l.id === p.editLine.id || (l.street_group && l.street_group === p.editLine.group)))).map((l) => (
            <polyline key={l.id} points={toPts(l.path)} fill="none" stroke="var(--accent)" strokeOpacity={0.45} strokeWidth={5} strokeLinecap="round"
              style={{ pointerEvents: p.editLine ? "none" : "stroke", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); p.onPickLine(l); }} onPointerDown={(e) => e.stopPropagation()} />
          ))}
          {p.editLine && p.editLine.path.length > 0 && (
            <polyline points={toPts(p.editLine.path)} fill="none" stroke="var(--danger)" strokeWidth={p.editLine.kind === "street" ? 2 : 4} strokeDasharray="8 5" strokeLinecap="round" />
          )}
          {p.editLine?.kind === "street" && p.editLine.path.length > 1 && [1, -1].map((sgn) => (
            <polyline key={sgn} points={toPts(offsetPath(p.editLine!.path, (sgn * p.editLine!.width) / 2))} fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" />
          ))}
        </svg>
      )}
      <StallMarkers view={view} placed={placed} colorOf={(id) => categoryColor(byId.get(id)?.category_code)}
        stateOf={(id) => (id === p.currentSpotId ? "selected" : p.mode === "patrol" ? "muted" : "default")}
        onSelect={p.onMarker} ariaLabelOf={(id) => mLabel(byId.get(id)?.m_number ?? 0)} />
      {view.zoom >= 19 && p.mode !== "lines" && [...placed.values()].map((pl) => (
        <span key={`l${pl.id}`} style={{ position: "absolute", left: pl.x + pl.size / 2 + 2, top: pl.y - 7, fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>
          {mLabel(byId.get(pl.id)?.m_number ?? 0)}
        </span>
      ))}
      <UserLocation view={view} pos={p.userPos} />
      {p.editLine?.path.map(([a, b], i) => {
        const q = view.project(a, b);
        return (
          <span key={i} role="button" aria-label={`점 ${i + 1}`} style={{ position: "absolute", left: q.x, top: q.y, width: 18, height: 18, transform: "translate(-50%,-50%)", borderRadius: 4,
            background: "#fff", border: "3px solid var(--danger)", pointerEvents: "auto", touchAction: "none", cursor: "grab", zIndex: 6 }}
            onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); dragging.current = { kind: "vertex", i }; }}
            onPointerMove={(e) => {
              const d = dragging.current;
              if (d?.kind !== "vertex" || !p.editLine) return;
              const [la, ln] = rel(e);
              p.onEditLine({ ...p.editLine, path: p.editLine.path.map((pt, j) => (j === d.i ? [la, ln] : pt)) });
            }}
            onPointerUp={() => { dragging.current = null; }} onClick={(e) => e.stopPropagation()} />
        );
      })}
      {cand && (
        <>
          <span className="marker" data-state="candidate" style={{ left: cand.x, top: cand.y, width: 22, height: 22 }} aria-label="등록 위치 (드래그로 조정)"
            onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); dragging.current = { kind: "cand" }; }}
            onPointerMove={(e) => { if (dragging.current?.kind === "cand") { const [la, ln] = rel(e); p.onMoveCandidate(la, ln); } }}
            onPointerUp={() => { dragging.current = null; }} onClick={(e) => e.stopPropagation()} />
          <div className="callout callout--plain" style={{ left: cand.x, top: cand.y - 11, pointerEvents: "none" }}>
            <IconPin size={16} style={{ color: "var(--danger)" }} />등록 위치 ({mLabel(p.nextM)})
          </div>
        </>
      )}
    </>
  );
}

// ───────────── display lines panel (§31) ─────────────
function lineToEdit(l: FieldLine): EditLine {
  return l.street_group && l.center_path
    ? { kind: "street", id: null, group: l.street_group, name: l.name, path: l.center_path, width: l.width_m ?? DEFAULT_STREET_WIDTH }
    : { kind: "line", id: l.id, group: null, name: l.name, path: l.path, width: DEFAULT_STREET_WIDTH };
}

function LinesPanel({ lines, edit, setEdit, onSaved, onError }: {
  lines: FieldLine[]; edit: EditLine | null; setEdit: (e: EditLine | null) => void; onSaved: () => void; onError: (e: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit || edit.path.length < 2) return;
    setBusy(true);
    try {
      if (edit.kind === "street") await adminCall("admin_save_street", { p_group: edit.group, p_name: edit.name, p_center: edit.path, p_width: edit.width });
      else await adminCall("admin_save_display_line", { p_id: edit.id, p_name: edit.name, p_path: edit.path });
      onSaved();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!edit || (!edit.id && !edit.group) || !confirm("삭제할까요? (기록은 보존돼요)")) return;
    setBusy(true);
    try {
      if (edit.group) await adminCall("admin_delete_street", { p_group: edit.group });
      else await adminCall("admin_delete_display_line", { p_id: edit.id });
      onSaved();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  // one row per street (its two edges share a group), plus single-side lines
  const items = lines.filter((l, i) => !l.street_group || lines.findIndex((x) => x.street_group === l.street_group) === i);
  if (!edit) {
    return (
      <div className="sheet" style={{ maxHeight: "45dvh", overflowY: "auto" }}>
        <span className="sheet__handle" aria-hidden />
        <p className="small muted" style={{ margin: "0 0 8px" }}>길 가운데를 따라 그리고 폭을 정하면 양쪽 보도에 노점 줄이 생겨요. 기존 길을 탭하면 편집할 수 있어요.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn--primary" style={{ flex: 2 }} onClick={() => setEdit({ kind: "street", id: null, group: null, name: "", path: [], width: DEFAULT_STREET_WIDTH })}>길 그리기 (양쪽 노점)</button>
          <button className="btn btn--outline" style={{ flex: 1, fontSize: 14 }} onClick={() => setEdit({ kind: "line", id: null, group: null, name: "", path: [], width: DEFAULT_STREET_WIDTH })}>한쪽 선만</button>
        </div>
        <ul className="list" style={{ marginTop: 8 }}>
          {items.map((l) => (
            <li key={l.id}><button className="row" style={{ width: "100%", textAlign: "left" }} onClick={() => setEdit(lineToEdit(l))}>
              <span style={{ flex: 1 }}>{l.name || "이름 없는 길"}</span>
              <span className="small muted">{l.street_group ? `양쪽 · 폭 ${l.width_m}m` : "한쪽"}</span></button></li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="sheet">
      <span className="sheet__handle" aria-hidden />
      <p className="small" style={{ margin: "0 0 8px" }}>
        {edit.kind === "street" ? "지도를 탭해 길 가운데를 따라 점을 찍으세요. 파란 선 두 개가 양쪽 노점 줄이에요." : "지도를 탭해 노점이 늘어선 보도 가장자리를 따라 점을 찍으세요."} 점은 끌어서 옮길 수 있어요.
      </p>
      <input className="input" placeholder="길 이름 (예: 명동8길)" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
      {edit.kind === "street" && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 14 }}>
          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>길 폭 {edit.width}m</span>
          <input type="range" min={6} max={30} step={1} value={edit.width} onChange={(e) => setEdit({ ...edit, width: Number(e.target.value) })} style={{ flex: 1 }} aria-label="길 폭(미터)" />
        </label>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button className="btn btn--outline" style={{ height: 42, flex: 1 }} disabled={!edit.path.length} onClick={() => setEdit({ ...edit, path: edit.path.slice(0, -1) })}>마지막 점 삭제</button>
        {(edit.id || edit.group) && <button className="btn btn--outline" style={{ height: 42, flex: 1, color: "var(--danger)" }} disabled={busy} onClick={remove}>삭제</button>}
      </div>
      <div className="sheet__actions">
        <button className="btn btn--outline" style={{ flex: 1 }} onClick={() => setEdit(null)}>취소</button>
        <button className="btn btn--primary" style={{ flex: 2 }} disabled={busy || edit.path.length < 2} onClick={save}>저장 (점 {edit.path.length}개)</button>
      </div>
    </div>
  );
}

// ───────────── patrol change sheet (§102) ─────────────
type StallEditorData = {
  stall: { id: string; category_code: string; hours_mode: "DEFAULT" | "CUSTOM" };
  items: { id: string; display_name: string; price_type: MenuRow["price_type"]; price_amount: number | null; price_min: number | null; price_max: number | null; operator_spice_level: number | null; is_representative: boolean }[];
  hours: DayHours[];
  spot: { hint_landmark_id: string | null; hint_text_i18n: Record<string, string> } | null;
};

export function itemsToRows(items: StallEditorData["items"]): MenuRow[] {
  return items.map((i, n) => ({ key: `e${n}-${i.id}`, id: i.id, name: i.display_name, price: i.price_amount, price_type: i.price_type,
    price_min: i.price_min, price_max: i.price_max, spice: i.operator_spice_level, is_representative: i.is_representative }));
}

function ChangeSheet({ item, routeId, defaults, landmarks, onClose, onSaved, onError }: {
  item: RouteItem; routeId: string | null; defaults: DayHours[]; landmarks: LandmarkOpt[];
  onClose: () => void; onSaved: () => void; onError: (e: unknown) => void;
}) {
  const [loaded, setLoaded] = useState<StallEditorData | null>(null);
  const [newOccupant, setNewOccupant] = useState(!item.stall_id);
  const [category, setCategory] = useState<string | null>(item.category_code);
  const [rows, setRows] = useState<MenuRow[]>(defaultRows());
  const [hours, setHours] = useState<HoursValue>({ mode: "DEFAULT" });
  const [hint, setHint] = useState<HintValue>({ landmark_id: item.hint_landmark_id, text: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const reqId = useRef(newRequestId());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!item.stall_id) return;
    adminCall<StallEditorData>("admin_get_stall", { p_stall: item.stall_id }).then((d) => {
      setLoaded(d);
      const r = itemsToRows(d.items);
      setRows(r.length >= 5 ? r : [...r, ...defaultRows(5 - r.length)]);
      setHours(d.stall.hours_mode === "CUSTOM" && d.hours.length === 7 ? { mode: "CUSTOM", days: d.hours } : { mode: "DEFAULT" });
      setHint({ landmark_id: d.spot?.hint_landmark_id ?? null, text: d.spot?.hint_text_i18n?.ko ?? "" });
    }).catch((e) => onErrorRef.current(e));
  }, [item.stall_id]);

  const toggleOccupant = (v: boolean) => {
    setNewOccupant(v);
    if (v) { setRows(defaultRows()); setHours({ mode: "DEFAULT" }); setCategory(null); }
    else if (loaded) { const r = itemsToRows(loaded.items); setRows(r.length >= 5 ? r : [...r, ...defaultRows(5 - r.length)]); setCategory(loaded.stall.category_code); }
  };

  const save = async () => {
    if (!category) return;
    setBusy(true);
    const p: Record<string, unknown> = { client_request_id: reqId.current, spot_id: item.spot_id, route_id: routeId, new_occupant: newOccupant, items: rowsToItems(rows), note: note || undefined };
    if (newOccupant || category !== loaded?.stall.category_code) p.category_code = category;
    // only send hours when they actually changed, so untouched owner-confirmed hours keep their source
    const loadedHours = loaded && loaded.stall.hours_mode === "CUSTOM" && loaded.hours.length === 7 ? JSON.stringify(loaded.hours.map(({ weekday, is_open, open_min, close_min }) => ({ weekday, is_open, open_min, close_min }))) : "DEFAULT";
    const nowHours = hours.mode === "CUSTOM" ? JSON.stringify(hours.days.map(({ weekday, is_open, open_min, close_min }) => ({ weekday, is_open, open_min, close_min }))) : "DEFAULT";
    if (newOccupant || nowHours !== loadedHours) p.hours = hours.mode === "CUSTOM" ? { mode: "CUSTOM", days: hours.days } : { mode: "DEFAULT" };
    if (hint.landmark_id !== (loaded?.spot?.hint_landmark_id ?? item.hint_landmark_id) || hint.text) p.hint = hintToPayload(hint);
    try { await adminCall("field_apply_change", { p }); onSaved(); } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet sheet--overlay" role="dialog" aria-modal="true" aria-label="변경 기록">
        <span className="sheet__handle" aria-hidden />
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ fontSize: 18, flex: 1 }}>{oLabel(item.o_number)} 변경 <span className="muted small">{mLabel(item.m_number)}</span></b>
          <button className="header__btn" onClick={onClose} aria-label="닫기"><IconX /></button>
        </div>
        <div className="seg" style={{ marginTop: 8 }}>
          <button aria-pressed={!newOccupant} disabled={!item.stall_id} onClick={() => toggleOccupant(false)}>같은 노점 · 정보 변경</button>
          <button aria-pressed={newOccupant} onClick={() => toggleOccupant(true)}>다른 노점으로 바뀜</button>
        </div>
        <div className="field"><span className="field__label">카테고리</span><CategoryPicker value={category} onChange={setCategory} /></div>
        <div className="field"><span className="field__label">메뉴 · 가격 · 맵기</span>
          <MenuRowsEditor rows={rows} onChange={setRows} advanced showSpice={category !== "fashion_goods"} />
        </div>
        <div className="field"><span className="field__label">랜드마크 설명</span><HintField value={hint} onChange={setHint} landmarks={landmarks} at={{ lat: item.lat, lng: item.lng }} /></div>
        <div className="field"><span className="field__label">운영시간</span><HoursEditor value={hours} onChange={setHours} defaults={defaults} /></div>
        <div className="field"><span className="field__label">메모 (선택)</span><input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="sheet__actions">
          <button className="btn btn--outline" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn btn--primary" style={{ flex: 2 }} disabled={busy || !category} onClick={save}>{busy ? "저장 중…" : "변경 저장"}</button>
        </div>
      </div>
    </>
  );
}
