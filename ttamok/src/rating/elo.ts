// 따목 ELO.
//
// 기대 승률  E_A = 1 / (1 + 10^((R_B − R_A) / SCALE))
// 점수 변화  Δ_A = round(K_A × (S_A − E_A))   (승 S=1, 패 S=0; 따목엔 무승부 규칙이 아직 없다)
//
// - 모든 신규 유저는 500점(18급)에서 시작한다. 하한은 0점이다(0~564점은 모두 18급).
// - SCALE·K는 잠정값이다. scripts/simulate-ratings.ts 로 "2500점(9단) 이상 ≈ 전체의 0.05%"가 되도록
//   보정 중이며(작업 중), 실제 유저 분포가 쌓이면 통계로 재보정한다.
// - K는 대국 수에 따라 줄어든다. 처음에는 크게 움직여 자기 실력대에 빨리 도달하고, 이후 안정된다.

export const INITIAL_RATING = 500;
export const RATING_FLOOR = 0;
export const RATING_SCALE = 640;

export interface KStep {
  /** 이 대국 수 미만일 때 적용 */
  untilGames: number;
  k: number;
}

export const K_SCHEDULE: readonly KStep[] = Object.freeze([
  { untilGames: 10, k: 160 },
  { untilGames: 30, k: 96 },
  { untilGames: 100, k: 64 },
  { untilGames: Infinity, k: 40 },
]);

export interface RatingParams {
  scale: number;
  floor: number;
  kSchedule: readonly KStep[];
}

export const DEFAULT_RATING_PARAMS: RatingParams = Object.freeze({
  scale: RATING_SCALE,
  floor: RATING_FLOOR,
  kSchedule: K_SCHEDULE,
});

export interface RatedPlayer {
  rating: number;
  /** 지금까지 둔 랭크 대국 수 (이번 대국 제외) */
  games: number;
}

export function expectedScore(rating: number, opponentRating: number, scale = RATING_SCALE): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / scale));
}

export function kFactor(games: number, schedule: readonly KStep[] = K_SCHEDULE): number {
  for (const step of schedule) if (games < step.untilGames) return step.k;
  return schedule[schedule.length - 1].k;
}

export interface RatingChange {
  winner: { before: number; after: number; delta: number };
  loser: { before: number; after: number; delta: number };
}

/** 한 판의 결과로 두 사람의 새 점수를 계산한다(순수 함수, 정수 점수). */
export function rateGame(winner: RatedPlayer, loser: RatedPlayer, params: RatingParams = DEFAULT_RATING_PARAMS): RatingChange {
  const ew = expectedScore(winner.rating, loser.rating, params.scale);
  const gain = Math.max(1, Math.round(kFactor(winner.games, params.kSchedule) * (1 - ew)));
  const loss = Math.round(kFactor(loser.games, params.kSchedule) * (1 - ew)); // 패자 기대승률 = 1 − ew
  const winnerAfter = winner.rating + gain;
  const loserAfter = Math.max(params.floor, loser.rating - loss);
  return {
    winner: { before: winner.rating, after: winnerAfter, delta: winnerAfter - winner.rating },
    loser: { before: loser.rating, after: loserAfter, delta: loserAfter - loser.rating },
  };
}
