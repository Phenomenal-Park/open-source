"use client";
import { useMemo, useState } from "react";
import { AREA_DEFAULT_HOURS, formatMinute, groupHours, isDefaultHours, parseTime, type DayHours } from "@/lib/domain/hours";
import { formatPriceInput, parsePriceInput } from "@/lib/domain/price";
import { Chilis } from "@/components/ui/Chili";
import { IconCheck, IconChevronDown, IconPlus, IconX } from "@/components/ui/icons";

const WD = ["월", "화", "수", "목", "금", "토", "일"];

// ───────────── categories ─────────────
export type CategoryOpt = { code: string; name: string; color: string };
export const CATEGORY_OPTS: CategoryOpt[] = [
  { code: "fried_bunsik", name: "튀김·분식", color: "#E65454" },
  { code: "skewer_grill", name: "꼬치·구이", color: "#F28A30" },
  { code: "snack", name: "간식·스낵", color: "#2A9D8F" },
  { code: "dessert_fruit", name: "디저트·과일", color: "#D95C9F" },
  { code: "fashion_goods", name: "패션·잡화", color: "#625CCB" },
];
export const categoryColor = (code?: string | null) => (code ? `var(--c-${code}, ${CATEGORY_OPTS.find((c) => c.code === code)?.color ?? "#999"})` : "#999");

export function CategoryPicker({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="chiprow" style={{ padding: 0, flexWrap: "wrap" }} role="radiogroup" aria-label="대분류">
      {CATEGORY_OPTS.map((c) => (
        <button key={c.code} type="button" role="radio" aria-checked={value === c.code} className="chip chip--accent" aria-pressed={value === c.code} onClick={() => onChange(c.code)}>
          {value === c.code && <IconCheck size={16} />}{c.name}
        </button>
      ))}
    </div>
  );
}

// ───────────── spice ─────────────
// undefined/null = 미확인 → 0 안 매움 → 1 → 2 → 3 → 미확인 (one tap per step, §92)
const SPICE_CYCLE: (number | null)[] = [null, 0, 1, 2, 3];
export function SpiceToggle({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const next = () => onChange(SPICE_CYCLE[(SPICE_CYCLE.indexOf(value) + 1) % SPICE_CYCLE.length]);
  const label = value == null ? "미확인" : value === 0 ? "안 매움" : `${value}단계`;
  return (
    <button type="button" onClick={next} aria-label={`맵기: ${label} (눌러서 변경)`} title="맵기"
      style={{ height: 40, minWidth: 64, padding: "0 6px", border: "1px solid var(--line-strong)", borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: value == null ? "var(--muted)" : "var(--text)", background: "var(--surface)", flex: "none" }}>
      {value && value > 0 ? <Chilis level={value} size={13} /> : label}
    </button>
  );
}

// ───────────── menu rows ─────────────
export type MenuRow = {
  key: string; id?: string; name: string; price: number | null;
  price_type?: "FIXED" | "RANGE" | "VARIES" | "UNKNOWN"; price_min?: number | null; price_max?: number | null;
  spice: number | null; is_representative?: boolean;
};
let rowSeq = 0;
export const emptyRow = (): MenuRow => ({ key: `r${++rowSeq}`, name: "", price: null, spice: null });
export const defaultRows = (n = 5) => Array.from({ length: n }, emptyRow);

/** Serialize rows for the RPC. Empty rows are dropped (§89). */
export function rowsToItems(rows: MenuRow[]) {
  return rows.filter((r) => r.name.trim()).map((r) => {
    const type = r.price_type ?? (r.price != null ? "FIXED" : "UNKNOWN");
    return {
      id: r.id, name: r.name.trim(), price_type: type,
      price: type === "FIXED" ? r.price : null, price_min: type === "RANGE" ? r.price_min : null, price_max: type === "RANGE" ? r.price_max : null,
      spice: r.spice, is_representative: r.is_representative || undefined,
    };
  });
}

export function MenuRowsEditor({ rows, onChange, advanced = false, showSpice = true }: { rows: MenuRow[]; onChange: (r: MenuRow[]) => void; advanced?: boolean; showSpice?: boolean }) {
  const set = (k: string, patch: Partial<MenuRow>) => onChange(rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const firstFilled = rows.find((r) => r.name.trim())?.key;
  const flagged = rows.find((r) => r.is_representative && r.name.trim())?.key;
  const repKey = flagged ?? firstFilled;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 88px auto 28px", gap: 6, fontSize: 12.5, color: "var(--muted)", background: "var(--surface-2)", borderRadius: 8, padding: "6px 8px", marginBottom: 6 }}>
        <span>#</span><span>상품</span><span>가격 (원)</span><span>{showSpice ? "맵기" : ""}</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={r.key} style={{ marginBottom: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 88px auto 28px", gap: 6, alignItems: "center" }}>
            <span className="small muted" style={{ textAlign: "center" }}>{i + 1}.</span>
            <input className="input" style={{ height: 40 }} placeholder="상품명 입력" value={r.name} maxLength={80} enterKeyHint="next" autoComplete="off"
              onChange={(e) => set(r.key, { name: e.target.value })} aria-label={`${i + 1}번 상품명`} />
            {(r.price_type ?? "FIXED") === "FIXED" || r.price_type === "UNKNOWN" ? (
              <input className="input" style={{ height: 40, textAlign: "right" }} placeholder="가격 입력" inputMode="numeric" pattern="[0-9,]*" enterKeyHint="next"
                value={formatPriceInput(r.price)} aria-label={`${i + 1}번 가격`}
                onChange={(e) => { const p = parsePriceInput(e.target.value); set(r.key, { price: p, price_type: p != null ? "FIXED" : r.price_type === "FIXED" ? undefined : r.price_type }); }} />
            ) : (
              <span className="small" style={{ textAlign: "right" }}>{r.price_type === "RANGE" ? "범위" : "가격 다양"}</span>
            )}
            {showSpice ? <SpiceToggle value={r.spice} onChange={(v) => set(r.key, { spice: v })} /> : <span />}
            <button type="button" aria-label={`${i + 1}번 행 삭제`} className="muted" style={{ height: 40 }}
              onClick={() => onChange(rows.length > 1 ? rows.filter((x) => x.key !== r.key) : [emptyRow()])}><IconX size={18} /></button>
          </div>
          {advanced && r.name.trim() && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", margin: "4px 0 0 26px", fontSize: 13 }}>
              <select className="input" style={{ height: 34, width: "auto" }} value={r.price_type ?? (r.price != null ? "FIXED" : "UNKNOWN")} aria-label="가격 유형"
                onChange={(e) => set(r.key, { price_type: e.target.value as MenuRow["price_type"] })}>
                <option value="FIXED">고정 가격</option><option value="RANGE">가격 범위</option><option value="VARIES">가격 다양</option><option value="UNKNOWN">미확인</option>
              </select>
              {r.price_type === "RANGE" && (<>
                <input className="input" style={{ height: 34, width: 90 }} inputMode="numeric" placeholder="최소" value={formatPriceInput(r.price_min ?? null)} onChange={(e) => set(r.key, { price_min: parsePriceInput(e.target.value) })} />
                <span>–</span>
                <input className="input" style={{ height: 34, width: 90 }} inputMode="numeric" placeholder="최대" value={formatPriceInput(r.price_max ?? null)} onChange={(e) => set(r.key, { price_max: parsePriceInput(e.target.value) })} />
              </>)}
              <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <input type="radio" name="rep" checked={repKey === r.key} onChange={() => onChange(rows.map((x) => ({ ...x, is_representative: x.key === r.key })))} />대표
              </label>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="btn btn--block" onClick={() => onChange([...rows, emptyRow()])}
        style={{ height: 44, border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)", marginTop: 4 }}>
        <IconPlus size={18} />상품 추가
      </button>
    </div>
  );
}

// ───────────── hours ─────────────
export type HoursValue = { mode: "DEFAULT" } | { mode: "CUSTOM"; days: DayHours[] };

export function hoursSummary(days: DayHours[]): string {
  return groupHours(days).map((g) => {
    const label = g.from === g.to ? WD[g.from - 1] : `${WD[g.from - 1]}–${WD[g.to - 1]}`;
    if (!g.is_open) return `${label} 휴무`;
    const c = formatMinute(g.close_min);
    return `${label} ${formatMinute(g.open_min).text}–${c.nextDay ? `익일 ${c.text}` : c.text}`;
  }).join(" / ");
}

export function HoursEditor({ value, onChange, defaults = AREA_DEFAULT_HOURS }: { value: HoursValue; onChange: (v: HoursValue) => void; defaults?: DayHours[] }) {
  const [open, setOpen] = useState(value.mode === "CUSTOM");
  const days = value.mode === "CUSTOM" ? value.days : defaults;
  const setDay = (wd: number, patch: Partial<DayHours>) => {
    const next = days.map((d) => (d.weekday === wd ? { ...d, ...patch } : d));
    onChange(isDefaultHours(next, defaults) ? { mode: "DEFAULT" } : { mode: "CUSTOM", days: next });
  };
  return (
    <div>
      <button type="button" className="input" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", height: "auto", minHeight: 44, padding: "8px 12px" }}>
        <span style={{ fontSize: 14 }}>
          {value.mode === "DEFAULT" && <span className="muted small" style={{ display: "block" }}>기본값 사용</span>}
          {hoursSummary(days)}
        </span>
        <IconChevronDown size={18} />
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {days.map((d) => <DayRow key={d.weekday} d={d} onChange={(p) => setDay(d.weekday, p)} />)}
          <button type="button" className="btn btn--outline" style={{ height: 40, fontSize: 14 }} onClick={() => onChange({ mode: "DEFAULT" })}>기본값으로 되돌리기</button>
        </div>
      )}
    </div>
  );
}

function DayRow({ d, onChange }: { d: DayHours; onChange: (p: Partial<DayHours>) => void }) {
  const [o, setO] = useState(formatMinute(d.open_min).text);
  const [c, setC] = useState(formatMinute(d.close_min).text);
  const commit = (os: string, cs: string) => {
    const om = parseTime(os);
    let cm = parseTime(cs);
    if (om == null || cm == null) return;
    if (cm <= om) cm += 1440; // e.g. 16:00–02:00 closes the next day, never "before it opens" (§56)
    if (cm > 2880) return;
    onChange({ open_min: om, close_min: cm });
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "54px 1fr 12px 1fr", gap: 6, alignItems: "center" }}>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
        <input type="checkbox" checked={d.is_open} onChange={(e) => onChange({ is_open: e.target.checked })} />{WD[d.weekday - 1]}
      </label>
      <input className="input" style={{ height: 38 }} inputMode="numeric" value={o} disabled={!d.is_open} aria-label={`${WD[d.weekday - 1]} 시작`}
        onChange={(e) => setO(e.target.value)} onBlur={() => commit(o, c)} placeholder="16:00" />
      <span>–</span>
      <input className="input" style={{ height: 38 }} inputMode="numeric" value={c} disabled={!d.is_open} aria-label={`${WD[d.weekday - 1]} 종료`}
        onChange={(e) => setC(e.target.value)} onBlur={() => commit(o, c)} placeholder="24:00" />
    </div>
  );
}

// ───────────── location hint ─────────────
export type LandmarkOpt = { id: string; short: string; lat: number; lng: number };
export type HintValue = { landmark_id: string | null; text: string };

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * k, (a.lat - b.lat) * 110574);
}
export function nearestLandmarks(landmarks: LandmarkOpt[], at: { lat: number; lng: number } | null, n = 3) {
  if (!at) return [];
  return [...landmarks].map((l) => ({ l, d: dist(l, at) })).filter((x) => x.d < 250).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.l);
}
export const hintToPayload = (h: HintValue) => ({ landmark_id: h.landmark_id, relation: "near", verified: false, text_i18n: h.text.trim() ? { ko: h.text.trim() } : {} });

/** Default wording is always "근처" (§8). Verified strong relations are set in the stall editor only. */
export function HintField({ value, onChange, landmarks, at }: { value: HintValue; onChange: (v: HintValue) => void; landmarks: LandmarkOpt[]; at: { lat: number; lng: number } | null }) {
  const near = useMemo(() => nearestLandmarks(landmarks, at), [landmarks, at]);
  const selected = landmarks.find((l) => l.id === value.landmark_id);
  return (
    <div>
      {selected ? (
        <div className="input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{selected.short} 근처</span>
          <button type="button" aria-label="위치 힌트 지우기" className="muted" onClick={() => onChange({ landmark_id: null, text: "" })}><IconX size={18} /></button>
        </div>
      ) : (
        <input className="input" placeholder="예: 유니클로 근처" value={value.text} maxLength={60} onChange={(e) => onChange({ landmark_id: null, text: e.target.value })} />
      )}
      {!selected && near.length > 0 && (
        <div className="chiprow" style={{ padding: 0, marginTop: 6, flexWrap: "wrap" }}>
          {near.map((l) => <button type="button" key={l.id} className="chip chip--sm" onClick={() => onChange({ landmark_id: l.id, text: "" })}>{l.short} 근처</button>)}
        </div>
      )}
    </div>
  );
}
