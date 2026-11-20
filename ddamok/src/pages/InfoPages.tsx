// 소개 · 규칙 · 문의 (애드센스 심사·이용자 안내용 고정 페이지)
import { t } from "../i18n/index.ts";
import { Rich } from "../i18n/Rich.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";

const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;

export function AboutPage() {
  return (
    <main className="page narrow">
      <article className="panel prose">
        <h2>{t("about.title")}</h2>
        {(["about.p1", "about.p2", "about.p3"] as const).map((k) => <p key={k}><Rich text={t(k)} /></p>)}
        <p><a className="btn small primary" href="/">{t("nav.play")}</a></p>
      </article>
    </main>
  );
}

export function RulesPage() {
  return (
    <main className="page narrow">
      <article className="panel prose">
        <h2>{t("rulesPage.title")}</h2>
        <ul>{(["rules.1", "rules.2", "rules.3", "rules.4", "rules.5", "rules.6", "rules.7", "rules.8"] as const).map((k) => <li key={k}><Rich text={t(k)} /></li>)}</ul>
        <h3>{t("rulesPage.online")}</h3>
        <ul>{(["rulesPage.o1", "rulesPage.o2", "rulesPage.o3", "rulesPage.o4", "rulesPage.o5"] as const).map((k) => <li key={k}>{t(k)}</li>)}</ul>
      </article>
      <AdSlot slot={AD_SLOTS.rules} />
    </main>
  );
}

export function ContactPage() {
  return (
    <main className="page narrow">
      <article className="panel prose">
        <h2>{t("contact.title")}</h2>
        <p>{t("contact.body")}</p>
        <p>{CONTACT ? <a href={`mailto:${CONTACT}`}>{CONTACT}</a> : t("contact.unset")}</p>
      </article>
    </main>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <a href="/about">{t("footer.about")}</a>
      <a href="/rules">{t("footer.rules")}</a>
      <a href="/contact">{t("footer.contact")}</a>
      <a href="/privacy">{t("footer.privacy")}</a>
    </footer>
  );
}
