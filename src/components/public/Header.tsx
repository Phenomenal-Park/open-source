"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LOCALE_COOKIE, LOCALE_REGISTRY, LOCALES, localeInfo } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n";
import { IconBack, IconChevronDown, IconGlobe, IconMenu, IconSearch, IconX } from "@/components/ui/icons";
import { Logo } from "@/components/ui/Logo";

export function switchLocalePath(pathname: string, next: string): string {
  const parts = pathname.split("/");
  parts[1] = next;
  return parts.join("/") || `/${next}`;
}

export function rememberLocale(code: string) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
}

export function PublicHeader({ locale, t, title, backHref }: { locale: string; t: Messages; title?: string; backHref?: string }) {
  const [langOpen, setLangOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  return (
    <header className="header">
      {backHref && (
        <Link href={backHref} className="header__back" aria-label={t.nav.back}><IconBack /></Link>
      )}
      {title ? (
        <h1 className="header__title ellipsis">{title}</h1>
      ) : (
        <Link href={`/${locale}`} className="header__brand" aria-label={t.siteName}>
          <Logo size={24} />
          <span className="header__title ellipsis">{t.siteName}</span>
        </Link>
      )}
      <div style={{ position: "relative" }}>
        <button className={`header__lang ${t.siteName.length > 12 ? "header__lang--compact" : ""}`} onClick={() => setLangOpen((v) => !v)} aria-haspopup="menu" aria-expanded={langOpen} aria-label={t.nav.language}>
          <IconGlobe size={20} />
          <span>{localeInfo(locale).label}</span>
          <IconChevronDown size={14} />
        </button>
        {langOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setLangOpen(false)} />
            <div className="popover" role="menu" style={{ right: 0, top: 44 }}>
              {LOCALE_REGISTRY.filter((l) => LOCALES.includes(l.code)).map((l) => (
                <button key={l.code} role="menuitemradio" aria-checked={l.code === locale} aria-current={l.code === locale}
                  onClick={() => { rememberLocale(l.code); setLangOpen(false); router.push(switchLocalePath(pathname, l.code)); }}>
                  {l.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <span className="header__div" aria-hidden />
      <button className="header__btn" onClick={() => setDrawer(true)} aria-label={t.nav.menu}><IconMenu size={24} /></button>
      {drawer && <Drawer locale={locale} t={t} onClose={() => setDrawer(false)} />}
    </header>
  );
}

function Drawer({ locale, t, onClose }: { locale: string; t: Messages; onClose: () => void }) {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [q, setQ] = useState("");
  const router = useRouter();
  useEffect(() => {
    try { const v = localStorage.getItem("msm_theme"); if (v === "light" || v === "dark") setTheme(v); } catch { /* */ }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const applyTheme = (v: "system" | "light" | "dark") => {
    setTheme(v);
    try {
      if (v === "system") { localStorage.removeItem("msm_theme"); delete document.documentElement.dataset.theme; }
      else { localStorage.setItem("msm_theme", v); document.documentElement.dataset.theme = v; }
    } catch { /* */ }
  };
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <nav className="drawer" aria-label={t.nav.menu}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="header__btn" onClick={onClose} aria-label={t.nav.close}><IconX /></button>
        </div>
        <form role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { onClose(); router.push(`/${locale}?q=${encodeURIComponent(q.trim())}`); } }}
          style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search.placeholder} aria-label={t.nav.search} enterKeyHint="search" />
          <button className="header__btn" aria-label={t.nav.search}><IconSearch /></button>
        </form>
        <div className="drawer__group">
          <Link className="drawer__link" href={`/${locale}`} onClick={onClose}>{t.nav.map}</Link>
          <Link className="drawer__link" href={`/${locale}/rankings`} onClick={onClose}>{t.nav.rankings}</Link>
          <Link className="drawer__link" href={`/${locale}/guides`} onClick={onClose}>{t.nav.guides}</Link>
        </div>
        <div className="drawer__group">
          <div className="drawer__label">{t.nav.theme}</div>
          <div className="seg">
            {(["system", "light", "dark"] as const).map((v) => (
              <button key={v} aria-pressed={theme === v} onClick={() => applyTheme(v)}>
                {v === "system" ? t.nav.themeSystem : v === "light" ? t.nav.themeLight : t.nav.themeDark}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
