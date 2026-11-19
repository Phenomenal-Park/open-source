// 상단 제목 + 메뉴 + 언어. 메뉴는 일반 링크(페이지 전체를 새로 연다 — 광고 정책상 화면 전환 = 새 페이지).
import { lang, LANGS, setLang, t, type Lang } from "../i18n/index.ts";

export type Page = "play" | "records" | "profile" | "privacy";

export function Header({ page }: { page: Page }) {
  const link = (href: string, label: string, p: Page) => (
    <a href={href} className={page === p ? "nav-link active" : "nav-link"} aria-current={page === p ? "page" : undefined}>{label}</a>
  );
  return (
    <header className="app-header">
      <a href="/" className="brand"><h1>{t("app.name")}</h1></a>
      <nav className="nav">
        {link("/", t("nav.play"), "play")}
        {link("/records", t("nav.records"), "records")}
        {link("/profile", t("nav.profile"), "profile")}
        <select className="lang-select" aria-label={t("nav.language")} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </nav>
    </header>
  );
}
