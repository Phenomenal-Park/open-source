"use client";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminCall, errorText } from "@/components/admin/api";
import { categoryColor } from "@/components/admin/editors";
import { mLabel, oLabel } from "@/components/admin/FieldApp";

type Item = { o_number: number; spot_id: string; m_number: number; rep_name: string | null; category_code: string | null; status: string };
type Spot = { id: string; m_number: number; o_number: number | null; rep_name: string | null; category_code: string | null };

export default function RoutePage() {
  const [routeId, setRouteId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [outside, setOutside] = useState<Spot[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([adminCall<{ route_id: string; items: Item[] }>("field_route", {}), adminCall<{ spots: Spot[] }>("field_map")]);
      setRouteId(r.route_id); setItems(r.items); setOutside(m.spots.filter((s) => s.o_number == null));
    } catch (e) { setMsg(errorText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const apply = async (fn: string, args: Record<string, unknown>) => {
    try { const r = await adminCall<{ items: Item[] }>(fn, { p_route: routeId, ...args }); setItems(r.items); setMsg("O 번호가 다시 생성됐어요"); load(); }
    catch (e) { setMsg(errorText(e)); }
  };
  const move = (spot: string, to: number) => apply("admin_route_move", { p_spot: spot, p_to_position: to });

  return (
    <div className="app">
      <AdminHeader badge={<span className="tag">순찰 경로</span>} />
      <main className="page">
        <p className="small muted" style={{ marginTop: 12 }}>M은 고정 ID, O는 현재 순찰 순서예요. 순서를 바꾸면 O 번호가 자동으로 다시 매겨져요.</p>
        {msg && <p role="status" className="small">{msg}</p>}
        <ul className="list">
          {items.map((it) => (
            <li key={it.spot_id} className="row" draggable onDragStart={() => setDrag(it.spot_id)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag && drag !== it.spot_id) move(drag, it.o_number); setDrag(null); }} style={{ opacity: drag === it.spot_id ? 0.5 : 1 }}>
              <span aria-hidden style={{ cursor: "grab", color: "var(--muted)" }}>⋮⋮</span>
              <b style={{ width: 62 }}>{oLabel(it.o_number)}</b>
              <span className="chip__swatch" style={{ ["--cat" as string]: categoryColor(it.category_code) }} />
              <span className="ellipsis" style={{ flex: 1 }}>{mLabel(it.m_number)} · {it.rep_name ?? "—"}</span>
              <button className="btn btn--outline" style={{ height: 34, padding: "0 10px" }} aria-label="위로" disabled={it.o_number === 1} onClick={() => move(it.spot_id, it.o_number - 1)}>↑</button>
              <button className="btn btn--outline" style={{ height: 34, padding: "0 10px" }} aria-label="아래로" disabled={it.o_number === items.length} onClick={() => move(it.spot_id, it.o_number + 1)}>↓</button>
              <button className="btn btn--outline" style={{ height: 34, padding: "0 10px" }} onClick={() => {
                const v = prompt("이동할 O 번호", String(it.o_number)); const n = v ? parseInt(v, 10) : NaN; if (Number.isFinite(n)) move(it.spot_id, n);
              }}>이동</button>
              <button className="btn btn--ghost" style={{ height: 34, padding: "0 8px", color: "var(--danger)" }} onClick={() => {
                if (confirm(`${mLabel(it.m_number)}을(를) 순찰 경로에서 뺄까요? (위치 기록은 그대로)`)) apply("admin_route_remove", { p_spot: it.spot_id });
              }}>제외</button>
            </li>
          ))}
        </ul>
        {outside.length > 0 && (
          <section className="section">
            <h2 className="section__title">경로 밖 위치</h2>
            {outside.map((s) => (
              <div key={s.id} className="row">
                <span className="ellipsis" style={{ flex: 1 }}>{mLabel(s.m_number)} · {s.rep_name ?? "—"}</span>
                <select className="input" style={{ width: 150, height: 36 }} defaultValue="" aria-label="삽입 위치"
                  onChange={(e) => apply("admin_route_insert", { p_spot: s.id, p_after: e.target.value === "start" ? null : e.target.value })}>
                  <option value="" disabled>다음 순서에 삽입…</option>
                  <option value="start">맨 끝</option>
                  {items.map((it) => <option key={it.spot_id} value={it.spot_id}>{oLabel(it.o_number)} ({mLabel(it.m_number)}) 다음</option>)}
                </select>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
