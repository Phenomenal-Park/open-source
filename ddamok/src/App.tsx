import { Header, type Page } from "./components/Header.tsx";
import { MainPage } from "./pages/MainPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { RecordsPage } from "./pages/RecordsPage.tsx";
import { PrivacyPage } from "./pages/PrivacyPage.tsx";
import { AboutPage, ContactPage, Footer, RulesPage } from "./pages/InfoPages.tsx";
import { lang, t } from "./i18n/index.ts";

document.documentElement.lang = lang;
document.title = `${t("app.name")} — ${t("app.tagline")}`;

// 페이지 전환은 일반 링크(새 페이지 로드)로 한다 — 프로필·기보 화면의 광고가 정책에 맞게 새로 뜨도록.
type AnyPage = Page | "about" | "rules" | "contact";
function pageOf(path: string): AnyPage {
  for (const p of ["records", "profile", "privacy", "about", "rules", "contact"] as const) if (path.startsWith(`/${p}`)) return p;
  return "play";
}

export default function App() {
  const page = pageOf(location.pathname);
  return (
    <div className="app">
      <Header page={page === "about" || page === "rules" || page === "contact" ? "privacy" : page} />
      {page === "play" && <MainPage />}
      {page === "profile" && <ProfilePage />}
      {page === "records" && <RecordsPage />}
      {page === "privacy" && <PrivacyPage />}
      {page === "about" && <AboutPage />}
      {page === "rules" && <RulesPage />}
      {page === "contact" && <ContactPage />}
      <Footer />
    </div>
  );
}
