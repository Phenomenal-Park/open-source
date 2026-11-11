// Locale registry. Adding a language = add an entry + a messages file + translated data.
// Routes, DB (jsonb i18n maps / locale columns) and review translation are locale-agnostic.
export const LOCALE_REGISTRY = [
  { code: "ko", label: "한국어", htmlLang: "ko", hreflang: "ko", enabled: true },
  { code: "en", label: "English", htmlLang: "en", hreflang: "en", enabled: true },
  { code: "ja", label: "日本語", htmlLang: "ja", hreflang: "ja", enabled: true },
  { code: "zh-cn", label: "简体中文", htmlLang: "zh-CN", hreflang: "zh-Hans", enabled: true },
  { code: "vi", label: "Tiếng Việt", htmlLang: "vi", hreflang: "vi", enabled: false }, // future (§120)
] as const;

export type Locale = string;
export const LOCALES: string[] = LOCALE_REGISTRY.filter((l) => l.enabled).map((l) => l.code);
export const DEFAULT_LOCALE = "en"; // fallback for unsupported browsers (§5)
export const SOURCE_LOCALE = "ko"; // language field data is entered in
export const LOCALE_COOKIE = "msm_locale";

export function isLocale(x: string | undefined | null): x is Locale {
  return !!x && LOCALES.includes(x);
}

export function localeInfo(code: string) {
  return LOCALE_REGISTRY.find((l) => l.code === code) ?? LOCALE_REGISTRY[1];
}

/** Map an Accept-Language header to a supported locale. */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const prefs = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of prefs) {
    if (tag.startsWith("zh")) {
      // Traditional Chinese is not supported yet: only map Simplified variants.
      if (tag === "zh" || tag.includes("cn") || tag.includes("hans") || tag.includes("sg")) return "zh-cn";
      continue;
    }
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Fallback chain for localized data: requested → en → ko → anything. */
export function pick(map: Record<string, string | null | undefined> | null | undefined, locale: Locale): string {
  if (!map) return "";
  return map[locale] || map[DEFAULT_LOCALE] || map[SOURCE_LOCALE] || Object.values(map).find(Boolean) || "";
}
