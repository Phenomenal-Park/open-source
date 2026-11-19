import { describe, expect, it } from "vitest";
import { AI_FALLBACK_MS, closest, dueForAi, nextCheck, pickPairs, windowFor, type Waiter } from "./pairing.ts";

const w = (key: string, mmr: number, joinedAt: number, allowAi = true): Waiter => ({ key, userId: key, mmr, joinedAt, allowAi });

describe("레이팅매치 상대 고르기", () => {
  it("기다린 시간에 따라 범위가 넓어진다: 0~5초 ±100, 5~15초 ±250, 그 뒤 ±500", () => {
    expect([0, 4999, 5000, 14999, 15000, 60000].map(windowFor)).toEqual([100, 100, 250, 250, 500, 500]);
  });

  it("처음 5초는 ±100 안의 가장 가까운 상대만", () => {
    const now = 1_000_000;
    const me = w("me", 1500, now);
    expect(pickPairs([me, w("a", 1700, now), w("b", 1580, now)], now).map(([x, y]) => [x.key, y.key])).toEqual([["me", "b"]]);
    expect(pickPairs([me, w("a", 1650, now)], now)).toEqual([]);
  });

  it("5~15초는 ±250, 15초 뒤 ±500 — 더 오래 기다린 쪽 범위를 쓴다", () => {
    const t0 = 0;
    const old = w("old", 1500, t0);
    expect(pickPairs([old, w("x", 1700, 6000)], 6000)).toHaveLength(1); // old는 6초 대기 → ±250
    expect(pickPairs([old, w("x", 1900, 6000)], 6000)).toHaveLength(0);
    expect(pickPairs([old, w("x", 1900, 16000)], 16000)).toHaveLength(1); // old 16초 → ±500
    expect(pickPairs([old, w("x", 2100, 16000)], 16000)).toHaveLength(0);
  });

  it("여러 명이면 점수 차가 작은 쌍부터, 한 사람은 한 번만", () => {
    const now = 20000;
    const pairs = pickPairs([w("a", 1500, 0), w("b", 1510, 0), w("c", 1520, 0), w("d", 1900, 0)], now);
    expect(pairs.map(([x, y]) => [x.key, y.key].sort().join("-"))).toEqual(["a-b", "c-d"]);
  });

  it("같은 사람끼리는 붙지 않는다", () => {
    expect(pickPairs([{ ...w("a", 1500, 0), userId: "u" }, { ...w("b", 1500, 0), userId: "u" }], 1)).toEqual([]);
  });

  it("15초가 지나고 AI를 허용한 사람만 AI 대상, 가장 가까운 AI", () => {
    const list = [w("a", 1500, 0), w("b", 1500, 0, false), w("c", 1500, 5000)];
    expect(dueForAi(list, AI_FALLBACK_MS).map((x) => x.key)).toEqual(["a"]);
    expect(closest([{ mmr: 500 }, { mmr: 1490 }, { mmr: 1070 }], 1300)).toEqual({ mmr: 1490 });
  });

  it("다음 확인 시각: 범위가 넓어지는 5초·15초 시점", () => {
    expect(nextCheck([w("a", 1500, 1000)], 1000)).toBe(6000);
    expect(nextCheck([w("a", 1500, 1000)], 7000)).toBe(16000);
    expect(nextCheck([w("a", 1500, 1000, false)], 17000)).toBeNull();
    expect(nextCheck([], 0)).toBeNull();
  });
});
