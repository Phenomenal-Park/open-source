import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { isLocale, LOCALES, localeInfo } from "@/lib/i18n/config";
import { alternates, SITE_URL } from "@/lib/seo";
import "@/styles/globals.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.seoTitle, template: `%s | ${t.siteName}` },
    description: t.metaDescription,
    alternates: alternates(locale, ""),
    openGraph: { siteName: t.siteName, title: t.seoTitle, description: t.metaDescription, locale: localeInfo(locale).htmlLang, type: "website" },
  };
}

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#121417" }],
};

// Applies the saved theme before paint (no flash).
const themeScript = `try{var t=localStorage.getItem('msm_theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={localeInfo(locale).htmlLang} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
