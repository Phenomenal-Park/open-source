import ko, { type Messages } from "./messages/ko";
import en from "./messages/en";
import ja from "./messages/ja";
import zhCN from "./messages/zh-cn";
import { DEFAULT_LOCALE } from "./config";

const CATALOG: Record<string, Messages> = { ko, en, ja, "zh-cn": zhCN };

export type { Messages };
export function getMessages(locale: string): Messages {
  return CATALOG[locale] ?? CATALOG[DEFAULT_LOCALE];
}

/** "{n}위" → "3위" */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "").toString());
}
