// 바둑판·바둑돌 모양(기기마다 저장). 기본 / 단순(만화풍 흑백) / 고급(나무결 바둑판, 슬레이트·조개 돌)
import { useSyncExternalStore } from "react";

export type LookStyle = "basic" | "simple" | "premium";
export const LOOK_STYLES: readonly LookStyle[] = ["basic", "simple", "premium"];
export interface Look { board: LookStyle; stones: LookStyle }

const KEY = "ddamok.look";
const isStyle = (x: unknown): x is LookStyle => LOOK_STYLES.includes(x as LookStyle);

function load(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return { board: isStyle(v?.board) ? v.board : "basic", stones: isStyle(v?.stones) ? v.stones : "basic" };
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
