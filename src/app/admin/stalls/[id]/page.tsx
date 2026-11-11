"use client";
import { use, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminCall, errorText } from "@/components/admin/api";
import { CategoryPicker, defaultRows, HoursEditor, MenuRowsEditor, rowsToItems, type HoursValue, type MenuRow } from "@/components/admin/editors";
import { itemsToRows } from "@/components/admin/FieldApp";
import type { DayHours } from "@/lib/domain/hours";

type Data = {
  stall: { id: string; slug: string; category_code: string; official_name: string | null; hours_mode: "DEFAULT" | "CUSTOM"; hours_source: string };
  localizations: Record<string, { display_name: string | null }>;
  items: Parameters<typeof itemsToRows>[0];
  hours: DayHours[];
  spot: { m_number: number; hint_landmark_id: string | null; hint_relation: string; hint_verified: boolean; hint_text_i18n: Record<string, string> } | null;
  observations: { id: string; result: string; observed_at: string; details: Record<string, unknown> }[];
};
const LOCS = [["ko", "한국어"], ["en", "English"], ["ja", "日本語"], ["zh-cn", "简体中文"]] as const;

export default function StallEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [official, setOfficial] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<MenuRow[]>(defaultRows());
  const [hours, setHours] = useState<HoursValue>({ mode: "DEFAULT" });
  const [relation, setRelation] = useState("near");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fill = (x: Data) => {
    setD(x); setCategory(x.stall.category_code); setOfficial(x.stall.official_name ?? "");
    setNames(Object.fromEntries(LOCS.map(([l]) => [l, x.localizations[l]?.display_name ?? ""])));
    setRows([...itemsToRows(x.items), ...defaultRows(Math.max(0, 5 - x.items.length))]);
    setHours(x.stall.hours_mode === "CUSTOM" && x.hours.length === 7 ? { mode: "CUSTOM", days: x.hours } : { mode: "DEFAULT" });
    setRelation(x.spot?.hint_verified ? x.spot.hint_relation : "near");
  };
  useEffect(() => { adminCall<Data>("admin_get_stall", { p_stall: id }).then(fill).catch((e) => setMsg(errorText(e))); }, [id]);

  const save = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const rep = rows.find((r) => r.is_representative && r.id);
      const x = await adminCall<Data>("admin_update_stall", { p: {
        stall_id: id, category_code: category, official_name: official, display_names: names, items: rowsToItems(rows),
        hours: hours.mode === "CUSTOM" ? { mode: "CUSTOM", days: hours.days, source: "ADMIN" } : { mode: "DEFAULT" },
        ...(d.spot?.hint_landmark_id ? { hint: { landmark_id: d.spot.hint_landmark_id, relation, verified: relation !== "near", text_i18n: d.spot.hint_text_i18n } } : {}),
        ...(rep ? { representative_item_id: rep.id } : {}),
      } });
      fill(x); setMsg("저장했어요");
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };

  if (!d) return <div className="app"><AdminHeader /><main className="page"><p>{msg ?? "불러오는 중…"}</p></main></div>;
  return (
    <div className="app">
      <AdminHeader badge={<span className="tag">노점 편집{d.spot ? ` · M-${String(d.spot.m_number).padStart(3, "0")}` : ""}</span>} />
      <main className="page">
        <div className="field"><span className="field__label">대분류</span><CategoryPicker value={category} onChange={setCategory} /></div>
        <div className="field"><label htmlFor="off">공식 상호 (확인된 경우만)</label>
          <input id="off" className="input" value={official} onChange={(e) => setOfficial(e.target.value)} placeholder="없으면 비워 두세요 — 임의로 만들지 마세요" />
        </div>
        <div className="field"><span className="field__label">표시 이름 (선택 · 비우면 “대표 메뉴 · 위치 힌트”)</span>
          {LOCS.map(([l, label]) => (
            <input key={l} className="input" placeholder={label} value={names[l] ?? ""} onChange={(e) => setNames({ ...names, [l]: e.target.value })} aria-label={`표시 이름 ${label}`} />
          ))}
        </div>
        <div className="field"><span className="field__label">메뉴 · 가격 · 맵기 · 대표 메뉴</span><MenuRowsEditor rows={rows} onChange={setRows} advanced showSpice={category !== "fashion_goods"} /></div>
        <div className="field"><span className="field__label">운영시간</span><HoursEditor value={hours} onChange={setHours} /></div>
        {d.spot?.hint_landmark_id && (
          <div className="field"><span className="field__label">위치 관계 (강한 표현은 현장 확인 시에만)</span>
            <select className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
              <option value="near">근처 (기본)</option><option value="in_front">앞 — 현장 확인됨</option>
              <option value="opposite">맞은편 — 현장 확인됨</option><option value="beside">옆 — 현장 확인됨</option>
            </select>
          </div>
        )}
        {msg && <p role="status">{msg}</p>}
        <button className="btn btn--primary btn--block" style={{ marginTop: 16 }} disabled={busy} onClick={save}>저장</button>
        <section className="section">
          <h2 className="section__title">관찰 기록</h2>
          {d.observations.map((o) => (
            <div key={o.id} className="row small"><b style={{ width: 90 }}>{o.result}</b><span className="muted">{new Date(o.observed_at).toLocaleString("ko-KR")}</span></div>
          ))}
        </section>
      </main>
    </div>
  );
}
