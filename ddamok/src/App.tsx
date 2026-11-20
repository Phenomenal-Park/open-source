import { Header, type Page } from "./components/Header.tsx";
import { MainPage } from "./pages/MainPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { RecordsPage } from "./pages/RecordsPage.tsx";
import { PrivacyPage } from "./pages/PrivacyPage.tsx";
import { RankingsPage } from "./pages/RankingsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { AchievementsPage } from "./pages/AchievementsPage.tsx";
import { AboutPage, ContactPage, Footer, RulesPage } from "./pages/InfoPages.tsx";
import { lang, t, type MessageKey } from "./i18n/index.ts";

document.documentElement.lang = lang;
document.title = `${t("app.name")} — ${t("app.tagline")}`;

// 페이지 전환은 일반 링크(새 페이지 로드)로 한다 — 프로필·기보·순위·업적 화면의 광고가 정책에 맞게 새로 뜨도록.
type AnyPage = Exclude<Page, "info"> | "about" | "rules" | "contact" | "privacy";
const PAGES = ["records", "profile", "rankings", "achievements", "settings", "privacy", "about", "rules", "contact"] as const;
function pageOf(path: string): AnyPage {
  for (const p of PAGES) if (path.startsWith(`/${p}`)) return p;
  return "play";
}
const INFO_TITLE: Record<string, MessageKey> = { about: "footer.about", rules: "footer.rules", contact: "footer.contact", privacy: "footer.privacy" };

export default function App() {
  const page = pageOf(location.pathname);
  const info = INFO_TITLE[page];
  return (
    <div className="app">
      <Header page={info ? "info" : (page as Page)} title={info ? t(info) : undefined} />
      {page === "play" && <MainPage />}
      {page === "profile" && <ProfilePage />}
      {page === "records" && <RecordsPage />}
      {page === "rankings" && <RankingsPage />}
      {page === "achievements" && <AchievementsPage />}
      {page === "settings" && <SettingsPage />}
      {page === "privacy" && <PrivacyPage />}
      {page === "about" && <AboutPage />}
      {page === "rules" && <RulesPage />}
      {page === "contact" && <ContactPage />}
      <Footer />
    </div>
  );
}
