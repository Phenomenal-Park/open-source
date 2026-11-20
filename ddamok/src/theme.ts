// 바둑판·바둑돌 모양(기기마다 저장). 기본 / 카툰(흑백 만화풍 — 바둑판이 카툰이면 화면 전체도 큼직한 오락실 느낌) / 고급(나무결 바둑판, 슬레이트·조개 돌)
import { useSyncExternalStore } from "react";

export type LookStyle = "basic" | "cartoon" | "premium";
export const LOOK_STYLES: readonly LookStyle[] = ["basic", "cartoon", "premium"];
export interface Look { board: LookStyle; stones: LookStyle }

const KEY = "ddamok.look";
const isStyle = (x: unknown): x is LookStyle => LOOK_STYLES.includes(x as LookStyle);
/** 예전 이름(simple)도 카툰으로 읽는다 */
const norm = (x: unknown): LookStyle => (x === "simple" ? "cartoon" : isStyle(x) ? x : "basic");

function load(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return { board: norm(v?.board), stones: norm(v?.stones) };
  } catch {
    return { board: "basic", stones: "basic" };
  }
}

let current: Look = load();

/** 바둑판이 카툰이면 화면 전체를 오락실 느낌(큼직한 흑백 + 노랑)으로 */
function applyDoc() {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("ui-cartoon", current.board === "cartoon");
}
applyDoc();
const listeners = new Set<() => void>();

export function setLook(patch: Partial<Look>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  applyDoc();
  for (const f of listeners) f();
}

export function useLook(): Look {
  return useSyncExternalStore(
    (f) => { listeners.add(f); return () => listeners.delete(f); },
    () => current,
    () => current,
  );
}
