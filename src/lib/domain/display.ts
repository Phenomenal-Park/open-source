import { pick, SOURCE_LOCALE } from "../i18n/config";
import { fmt, type Messages } from "../i18n";
import type { Hint, I18n, StallCard } from "./types";
import { formatMinute, groupHours, type DayHours } from "./hours";
import { formatPrice, type Price } from "./price";

/** Location hint text. Strong relations only when verified (enforced in DB too) (§8). */
export function hintText(h: Hint | null | undefined, locale: string, t: Messages): string {
  if (!h) return "";
  const custom = h.text_i18n?.[locale];
  if (custom) return custom;
  if (!h.landmark) return pick(h.text_i18n, locale);
  const place = pick(h.landmark.short_i18n, locale) || pick(h.landmark.name_i18n, locale);
  const rel = h.verified ? h.relation : "near";
  return fmt(t.hint[rel], { p: place });
}

/** Menu item name: original typed name for the source language, otherwise the localized name. */
export function itemName(item: { name: string; name_i18n?: I18n }, locale: string): string {
  if (locale === SOURCE_LOCALE) return item.name;
  return item.name_i18n?.[locale] || item.name;
}

/**
 * Public display label. Never claims an official name that does not exist (§40):
 * localized display name → official name → representative item.
 */
export function stallTitle(s: Pick<StallCard, "names" | "official_name" | "items">, locale: string, fallback = ""): string {
  if (s.names?.[locale]) return s.names[locale];
  if (s.official_name) return s.official_name;
  const rep = s.items?.find((i) => i.rep) ?? s.items?.[0];
  return rep ? itemName(rep, locale) : fallback;
}

export function priceText(p: Price | null | undefined, t: Messages): string {
  const f = formatPrice(p);
  if (f) return f;
  return p?.type === "VARIES" ? t.stall.priceVaries : t.stall.priceUnknown;
}

export function hoursLines(days: DayHours[], t: Messages): string[] {
  return groupHours(days).map((g) => {
    const label = g.from === g.to ? t.weekdays[g.from - 1] : `${t.weekdays[g.from - 1]}–${t.weekdays[g.to - 1]}`;
    if (!g.is_open) return `${label} ${t.stall.closed}`;
    const o = formatMinute(g.open_min).text;
    const c = formatMinute(g.close_min);
    return `${label} ${o}–${c.nextDay ? fmt(t.stall.nextDay, { t: c.text }) : c.text}`;
  });
}

export function spiceLabel(level: number | null | undefined, t: Messages): string {
  if (level == null) return t.spice.unknown;
  return [t.spice.notSpicy, t.spice.l1, t.spice.l2, t.spice.l3][level] ?? t.spice.unknown;
}

export function timeAgo(iso: string, t: Messages, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return t.review.justNow;
  if (s < 3600) return fmt(t.review.minutes, { n: Math.floor(s / 60) });
  if (s < 86400) return fmt(t.review.hours, { n: Math.floor(s / 3600) });
  return fmt(t.review.days, { n: Math.floor(s / 86400) });
}

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_PHOTO_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}/${path}` : null;
}

export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
