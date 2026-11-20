// 바둑판·바둑돌 모양(기기마다 저장). 기본 / 카툰(흑백 만화풍) / 고급(나무결 바둑판, 슬레이트·조개 돌). 판과 돌만 바뀌고 나머지 화면은 그대로.
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
const listeners = new Set<() => void>();

export function setLook(patch: Partial<Look>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  for (const f of listeners) f();
}

export function useLook(): Look {
  return useSyncExternalStore(
    (f) => { listeners.add(f); return () => listeners.delete(f); },
    () => current,
    () => current,
  );
}
