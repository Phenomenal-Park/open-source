// 상단: 대국 화면은 제목 + 설정(⚙), 다른 화면은 좌상단 [← 이전] + 화면 이름. 프로필·랭킹·규칙·업적은 대국 화면의 버튼 4개(기보는 프로필에서).
// 화면 전환은 일반 링크(페이지 전체를 새로 연다 — 광고 정책상 화면 전환 = 새 페이지).
import { t, type MessageKey } from "../i18n/index.ts";
import { Logo } from "./Logo.tsx";

export type Page = "play" | "records" | "profile" | "rankings" | "achievements" | "settings" | "info";

const TITLES: Partial<Record<Page, MessageKey>> = {
  records: "nav.records", profile: "nav.profile", rankings: "nav.rankings", achievements: "nav.achievements", settings: "nav.settings",
};

/** 이전 화면으로(이 사이트 안에서 왔으면 뒤로, 아니면 대국 화면으로) */
function goBack() {
  const fromHere = document.referrer && new URL(document.referrer).origin === location.origin;
  if (fromHere && history.length > 1) history.back();
  else location.href = "/";
}

export function Header({ page, title }: { page: Page; title?: string }) {
  if (page === "play") {
    return (
      <header className="app-header">
        <a href="/" className="brand"><Logo /><h1>{t("app.name")}</h1></a>
        <nav className="nav">
          <a href="/settings" className="nav-settings">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" />
            </svg>
            {t("nav.settingsLabel")}
          </a>
        </nav>
      </header>
    );
  }
  const key = TITLES[page];
  return (
    <header className="app-header sub">
      <button type="button" className="back-btn" onClick={goBack}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden><path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t("nav.back")}
      </button>
      <h1 className="page-title">{title ?? (key ? t(key) : "")}</h1>
      <a href="/" className="brand small" aria-label={t("app.name")}>{t("app.name")}</a>
    </header>
  );
}
