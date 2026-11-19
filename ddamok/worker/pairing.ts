// 레이팅매치 상대 고르기(순수 함수 — 단위 테스트 대상).
//   기다린 시간 0~5초: 실력 점수 ±100 / 5~15초: ±250 / 15초 이후: ±500 — 범위 안에서 가장 가까운 상대.
//   두 사람 중 더 오래 기다린 쪽의 범위를 쓴다. 15초가 지나도 사람이 없으면(AI 허용 시) 점수가 가장 가까운 AI 3개 중 하나.

export interface Waiter {
  key: string;
  userId: string;
  mmr: number;
  joinedAt: number;
  allowAi: boolean;
}

export const RATED_WINDOWS: ReadonlyArray<{ until: number; range: number }> = [
  { until: 5_000, range: 100 },
  { until: 15_000, range: 250 },
  { until: Infinity, range: 500 },
];
export const AI_FALLBACK_MS = 15_000;

export function windowFor(waitMs: number): number {
  return RATED_WINDOWS.find((w) => waitMs < w.until)!.range;
}

/** 지금 짝지을 수 있는 쌍들(점수 차가 작은 쌍부터, 한 사람은 한 번만). */
export function pickPairs(waiters: readonly Waiter[], now: number): [Waiter, Waiter][] {
  const cands: { a: Waiter; b: Waiter; diff: number }[] = [];
  for (let i = 0; i < waiters.length; i++) {
    for (let j = i + 1; j < waiters.length; j++) {
      const a = waiters[i], b = waiters[j];
      if (a.userId === b.userId) continue;
      const diff = Math.abs(a.mmr - b.mmr);
      const range = Math.max(windowFor(now - a.joinedAt), windowFor(now - b.joinedAt));
      if (diff <= range) cands.push({ a, b, diff });
    }
  }
  cands.sort((x, y) => x.diff - y.diff || Math.min(x.a.joinedAt, x.b.joinedAt) - Math.min(y.a.joinedAt, y.b.joinedAt));
  const used = new Set<string>();
  const out: [Waiter, Waiter][] = [];
  for (const { a, b } of cands) {
    if (used.has(a.key) || used.has(b.key)) continue;
    used.add(a.key);
    used.add(b.key);
    out.push([a, b]);
  }
  return out;
}

/** AI와 붙일 사람들(AI 허용 + 15초 이상 대기). */
export function dueForAi(waiters: readonly Waiter[], now: number): Waiter[] {
  return waiters.filter((w) => w.allowAi && now - w.joinedAt >= AI_FALLBACK_MS);
}

/** 다음에 다시 확인할 시각(범위가 넓어지거나 AI 대체 시점). 없으면 null. */
export function nextCheck(waiters: readonly Waiter[], now: number): number | null {
  let next = Infinity;
  for (const w of waiters) {
    for (const t of [w.joinedAt + 5_000, w.joinedAt + 15_000]) if (t > now) next = Math.min(next, t);
    if (w.allowAi && w.joinedAt + AI_FALLBACK_MS <= now) next = Math.min(next, now + 1_000);
  }
  return Number.isFinite(next) ? next : null;
}

/** 실력 점수가 가장 가까운 n개(가까운 순). */
export function nearest<T extends { mmr: number }>(items: readonly T[], mmr: number, n: number): T[] {
  return [...items].sort((a, b) => Math.abs(a.mmr - mmr) - Math.abs(b.mmr - mmr)).slice(0, n);
}

/** AI 상대: 실력 점수가 가장 가까운 AI 3개 중 무작위 1개. */
export const AI_CANDIDATES = 3;
export function pickBot<T extends { mmr: number }>(bots: readonly T[], mmr: number, rand: () => number = Math.random): T | undefined {
  const near = nearest(bots, mmr, AI_CANDIDATES);
  return near[Math.floor(rand() * near.length)];
}
