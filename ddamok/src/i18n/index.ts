// 다국어: 한국어(ko) · 영어(en) · 일본어(ja). 저장된 선택 → 브라우저 언어 → 영어 순.
import { ko, type MessageKey, type Messages } from "./ko.ts";
import { en } from "./en.ts";
import { ja } from "./ja.ts";
import { rankFor } from "../rating/ranks.ts";
import { AI_LEVELS } from "../ai/levels.ts";

export type Lang = "ko" | "en" | "ja";
export const LANGS: readonly { id: Lang; label: string }[] = [
  { id: "ko", label: "한국어" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
];
export const CATALOGS: Record<Lang, Messages> = { ko, en, ja };
export type { MessageKey };

const KEY = "ddamok.lang";

export function detectLang(stored: string | null, browser: readonly string[]): Lang {
  if (stored === "ko" || stored === "en" || stored === "ja") return stored;
  for (const l of browser) {
    const p = l.toLowerCase().slice(0, 2);
    if (p === "ko" || p === "ja" || p === "en") return p;
  }
  return "en";
}

function initial(): Lang {
  if (typeof window === "undefined") return "ko";
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* */ }
  return detectLang(stored, navigator.languages ?? [navigator.language]);
}

export const lang: Lang = initial();

/** 언어를 바꾸고 페이지를 새로 연다 */
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* */ }
  location.reload();
}

export function translate(l: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = CATALOGS[l][key] ?? ko[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(lang, key, vars);
}

/** 서버 오류 코드 → 현재 언어 문구(없으면 서버가 준 문구) */
export function errorText(code: string | undefined, fallback: string): string {
  const k = `err.${code}` as MessageKey;
  return code && k in ko ? t(k) : fallback;
}

/** 급·단 이름: 18급·1단 / 18 kyu·1 dan / 18級·初段 */
export function rankLabel(l: Lang, rating: number): string {
  const r = rankFor(rating);
  if (l === "en") return `${r.level} ${r.kind === "kyu" ? "kyu" : "dan"}`;
  if (l === "ja") return r.kind === "kyu" ? `${r.level}級` : r.level === 1 ? "初段" : `${r.level}段`;
  return r.label;
}
export const rankName = (rating: number) => rankLabel(lang, rating);

/** AI 계정 이름(서버에는 한국어로 저장) → 현재 언어. 사람 닉네임은 그대로. */
export function displayName(username: string): string {
  const lv = AI_LEVELS.find((x) => x.name === username);
  return lv ? t(`ai.name.${lv.id}` as MessageKey) : username;
}

export const colorName = (p: "black" | "white") => t(p === "black" ? "player.black" : "player.white");

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
