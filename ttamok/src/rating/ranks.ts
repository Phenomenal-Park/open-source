// 급·단 표. 18급(500점)에서 시작해 1급 → 1단 → … → 9단(2500점).
//  - 급: 18급 500점부터 65점마다 한 급 (1급 = 1605점)
//  - 단: 1단 1700점부터 100점마다 한 단 (9단 = 2500점)
// 표만 바꾸면 기준점을 조정할 수 있다.

export interface Rank {
  /** 0 = 18급 … 17 = 1급, 18 = 1단 … 26 = 9단 */
  index: number;
  label: string;
  kind: "kyu" | "dan";
  level: number;
  minRating: number;
}

export const KYU_START = 500;
export const KYU_STEP = 65;
export const DAN_START = 1700;
export const DAN_STEP = 100;

export const RANKS: readonly Rank[] = Object.freeze([
  ...Array.from({ length: 18 }, (_, i): Rank => ({
    index: i, label: `${18 - i}급`, kind: "kyu", level: 18 - i, minRating: KYU_START + KYU_STEP * i,
  })),
  ...Array.from({ length: 9 }, (_, i): Rank => ({
    index: 18 + i, label: `${i + 1}단`, kind: "dan", level: i + 1, minRating: DAN_START + DAN_STEP * i,
  })),
]);

export const TOP_RANK = RANKS[RANKS.length - 1]; // 9단, 2500점

/** 점수 → 급·단. 500점 미만은 없지만(하한 500) 들어와도 18급으로 본다. */
export function rankFor(rating: number): Rank {
  const r = Math.round(rating);
  for (let i = RANKS.length - 1; i > 0; i--) if (r >= RANKS[i].minRating) return RANKS[i];
  return RANKS[0];
}

/** 다음 급·단까지 남은 점수 (9단이면 null). */
export function pointsToNextRank(rating: number): { next: Rank; points: number } | null {
  const cur = rankFor(rating);
  const next = RANKS[cur.index + 1];
  return next ? { next, points: next.minRating - Math.round(rating) } : null;
}
