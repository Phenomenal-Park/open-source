"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminCall, errorText } from "@/components/admin/api";
import { categoryColor } from "@/components/admin/editors";
import { mLabel, oLabel } from "@/components/admin/FieldApp";

type Spot = { id: string; m_number: number; o_number: number | null; status: string; rep_name: string | null; category_code: string | null; stall_id: string | null };
const STATUS: Record<string, string> = { active: "활성", candidate: "후보", dormant: "휴면", temporarily_blocked: "일시 차단(공사 등)", retired: "폐기" };

export default function SpotsPage() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [q, setQ] = useState("");
  const [dup, setDup] = useState("");
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setSpots((await adminCall<{ spots: Spot[] }>("field_map")).spots); } catch (e) { setMsg(errorText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const byM = (v: string) => spots.find((s) => s.m_number === parseInt(v.replace(/\D/g, ""), 10));
  const shown = spots.filter((s) => !q || mLabel(s.m_number).includes(q.toUpperCase()) || (s.rep_name ?? "").includes(q));

  return (
    <div className="app">
      <AdminHeader badge={<span className="tag">위치 관리</span>} />
      <main className="page">
        {msg && <p role="status" className="small">{msg}</p>}
        <section className="card" style={{ marginTop: 14 }}>
          <b>중복 위치 병합</b>
          <p className="small muted" style={{ margin: "4px 0 8px" }}>관찰·사진·제보 기록은 대상 위치로 옮겨지고, 중복 M 번호는 영구히 보존돼요(재사용 안 함).</p>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input className="input" style={{ width: 110 }} placeholder="중복 M-244" value={dup} onChange={(e) => setDup(e.target.value)} />
            <span>→</span>
            <input className="input" style={{ width: 110 }} placeholder="대상 M-073" value={target} onChange={(e) => setTarget(e.target.value)} />
            <button className="btn btn--primary" style={{ height: 44 }} onClick={async () => {
              const a = byM(dup), b = byM(target);
              if (!a || !b) return setMsg("M 번호를 확인해 주세요");
              if (!confirm(`${mLabel(a.m_number)} → ${mLabel(b.m_number)} 병합할까요?`)) return;
              try { await adminCall("admin_merge_spots", { p_duplicate: a.id, p_target: b.id }); setMsg("병합했어요"); setDup(""); setTarget(""); load(); } catch (e) { setMsg(errorText(e)); }
            }}>병합</button>
          </div>
        </section>
        <input className="input" style={{ marginTop: 14 }} placeholder="M 번호 또는 메뉴 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="list">
          {shown.map((s) => (
            <li key={s.id} className="row">
              <span className="chip__swatch" style={{ ["--cat" as string]: categoryColor(s.category_code) }} />
              <b style={{ width: 60 }}>{mLabel(s.m_number)}</b>
              <span className="ellipsis" style={{ flex: 1 }}>{s.rep_name ?? "—"} {s.o_number ? <span className="muted small">{oLabel(s.o_number)}</span> : null}</span>
              {s.stall_id && <Link className="linkbtn" href={`/admin/stalls/${s.stall_id}`}>편집</Link>}
              <select className="input" style={{ width: 130, height: 36 }} value={s.status} aria-label="상태"
                onChange={async (e) => {
                  try { await adminCall("admin_set_spot_status", { p_spot: s.id, p_status: e.target.value }); load(); } catch (err) { setMsg(errorText(err)); }
                }}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
