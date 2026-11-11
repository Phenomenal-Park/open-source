"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { IconMenu, IconX } from "@/components/ui/icons";

export function AdminHeader({ badge, children }: { badge?: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="header">
      <Link href="/admin" className="header__title" style={{ flex: "none", fontSize: 20 }}>관리자 모드</Link>
      {badge && <><span className="header__div" aria-hidden /><span style={{ flex: 1, minWidth: 0 }}>{badge}</span></>}
      {!badge && <span style={{ flex: 1 }} />}
      {children}
      <button className="header__btn" onClick={() => setOpen(true)} aria-label="메뉴"><IconMenu size={24} /></button>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <nav className="drawer" aria-label="관리자 메뉴">
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="header__btn" onClick={() => setOpen(false)} aria-label="닫기"><IconX /></button>
            </div>
            <Link className="drawer__link" href="/admin/field">현장 모드</Link>
            <Link className="drawer__link" href="/admin/route">순찰 경로</Link>
            <Link className="drawer__link" href="/admin/spots">위치(Spot) 관리</Link>
            <Link className="drawer__link" href="/admin/security">보안 · 2단계 인증</Link>
            <Link className="drawer__link" href="/ko" target="_blank">공개 지도 보기</Link>
            <button className="drawer__link" style={{ width: "100%", color: "var(--danger)" }}
              onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); window.location.href = "/admin/login"; }}>로그아웃</button>
          </nav>
        </>
      )}
    </header>
  );
}
