import type { Metadata } from "next";
import { LOCALE_REGISTRY, LOCALES } from "./i18n/config";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** canonical + hreflang alternates for a locale-prefixed path ("" for the home page). */
export function alternates(locale: string, path: string): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of LOCALE_REGISTRY.filter((x) => LOCALES.includes(x.code))) languages[l.hreflang] = `${SITE_URL}/${l.code}${path}`;
  languages["x-default"] = `${SITE_URL}/en${path}`;
  return { canonical: `${SITE_URL}/${locale}${path}`, languages };
}
