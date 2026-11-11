import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminCaller, whoami } from "@/lib/server/auth";
import { AdminHeader } from "@/components/admin/AdminHeader";

export const dynamic = "force-dynamic";

// Intentionally plain (§126): Field Mode is the priority.
export default async function AdminHome() {
  const caller = await getAdminCaller();
  if (!caller) redirect("/admin/login");
  const me = await whoami(caller).catch(() => null);
  if (!me?.role) redirect("/admin/login");
  const roleLabel = { owner: "소유자", admin: "관리자", field_worker: "현장 요원" }[me.role];
  return (
    <div className="app">
      <AdminHeader />
      <main className="page">
        <p className="muted small" style={{ marginTop: 16 }}>권한: {roleLabel}</p>
        <ul className="list">
          <li><Link className="drawer__link" href="/admin/field">현장 모드 (등록 · 순찰 · 표시선)</Link></li>
          <li><Link className="drawer__link" href="/admin/route">순찰 경로 순서</Link></li>
          <li><Link className="drawer__link" href="/admin/spots">위치(Spot) 관리 · 중복 병합</Link></li>
          <li><Link className="drawer__link" href="/admin/security">보안 · 2단계 인증</Link></li>
        </ul>
      </main>
    </div>
  );
}
