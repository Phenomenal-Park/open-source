// 따목 점수 체계 — "실력 점수(MMR)" + "표시 점수" 2단 구조.
//
// ■ 실력 점수(mmr, 비공개)
//   표준 ELO. 기대 승률 E = 1 / (1 + 10^((상대 mmr − 내 mmr) / SCALE)), 변화 Δ = K × (결과 − E).
//   모든 신규 유저는 MMR_START(1500, 전체 중간값 = 3급 부근)에서 시작한다.
//   승자가 얻는 만큼 패자가 잃는 제로섬이라 시간이 지나도 분포가 부풀지 않는다.
//   → 중간값 ≈ 1500(5급~1단 사이), 2500점 이상 ≈ 0.05%를 SCALE로 맞춘다(scripts/simulate-ratings.ts).
//
// ■ 표시 점수(rating, 공개 = 급·단)
//   모든 신규 유저는 500점(18급)에서 시작해 자기 실력 점수까지 빠르게 올라간다.
//   - 표시 점수 < 실력 점수인 동안(= 아직 올라가는 중):
//       승리: 실력 점수 변화 + 승급 보너스(1000점 미만 +80, 1500점 미만 +50, 그 위 +25) × 연승 배율
//       연승 배율: 2연승 ×1.25, 3연승 ×1.5, 4연승 ×1.75, 5연승 이상 ×2
//       패배: 1000점 미만은 잃지 않음, 1500점 미만은 절반만 잃음
//   - 표시 점수는 실력 점수를 넘지 않는다. 따라잡은 뒤에는 실력 점수와 똑같이 움직인다.
// ■ 고단자 이변 규칙
//   표시 점수 7단(2300점) 이상이 실력 점수가 더 낮은 상대에게 지면, 그 판의 점수 이동을 UPSET_MULTIPLIER배로 키운다.
//   고단자는 "훅" 깎이고, 이긴 쪽은 같은 만큼 크게 오른다(제로섬 → 전체 점수는 부풀거나 줄지 않는다).
//
//   보너스는 "따라잡기"에만 쓰이므로 아무리 많이 둬도 점수 인플레이션이 없다.
//   하한은 0점(0~564점은 18급).

export const INITIAL_RATING = 500;
export const MMR_START = 1500;
export const RATING_FLOOR = 0;
export const RATING_SCALE = 350;

/** 이 표시 점수(7단) 이상이 낮은 상대에게 지면 이변 규칙 적용 */
export const UPSET_RATING = 2300;
export const UPSET_MULTIPLIER = 2.5;

export interface KStep {
  /** 이 대국 수 미만일 때 적용 */
  untilGames: number;
  k: number;
}

/** 실력 점수의 K. 처음 몇 판은 크게 움직여 자기 실력대를 빨리 찾는다. */
export const K_SCHEDULE: readonly KStep[] = Object.freeze([
  { untilGames: 10, k: 64 },
  { untilGames: 30, k: 40 },
  { untilGames: Infinity, k: 24 },
]);

export interface ClimbStep {
  /** 표시 점수가 이 값 미만일 때 적용 */
  below: number;
  winBonus: number;
  /** 질 때 잃는 비율(0 = 안 잃음) */
  lossFactor: number;
}

export const CLIMB_SCHEDULE: readonly ClimbStep[] = Object.freeze([
  { below: 1000, winBonus: 80, lossFactor: 0 },
  { below: 1500, winBonus: 50, lossFactor: 0.5 },
  { below: Infinity, winBonus: 25, lossFactor: 1 },
]);

/** n연승(이번 승리 포함)일 때 승급 보너스 배율. */
export function streakMultiplier(streak: number): number {
  return 1 + 0.25 * Math.min(Math.max(streak - 1, 0), 4);
}

export interface RatingParams {
  scale: number;
  floor: number;
  kSchedule: readonly KStep[];
  climb: readonly ClimbStep[];
  upsetRating: number;
  upsetMultiplier: number;
}

export const DEFAULT_RATING_PARAMS: RatingParams = Object.freeze({
  scale: RATING_SCALE,
  floor: RATING_FLOOR,
  kSchedule: K_SCHEDULE,
  climb: CLIMB_SCHEDULE,
  upsetRating: UPSET_RATING,
  upsetMultiplier: UPSET_MULTIPLIER,
});

export interface RatedPlayer {
  /** 표시 점수 */
  rating: number;
  /** 실력 점수(비공개) */
  mmr: number;
  /** 지금까지 둔 랭크 대국 수(이번 대국 제외) */
  games: number;
  /** 현재 연승 수(이번 대국 제외) */
  winStreak: number;
}

export function newRatedPlayer(): RatedPlayer {
  return { rating: INITIAL_RATING, mmr: MMR_START, games: 0, winStreak: 0 };
}

export function expectedScore(mmr: number, opponentMmr: number, scale = RATING_SCALE): number {
  return 1 / (1 + Math.pow(10, (opponentMmr - mmr) / scale));
}

export function kFactor(games: number, schedule: readonly KStep[] = K_SCHEDULE): number {
  for (const step of schedule) if (games < step.untilGames) return step.k;
  return schedule[schedule.length - 1].k;
}

function climbStep(rating: number, climb: readonly ClimbStep[]): ClimbStep {
  return climb.find((c) => rating < c.below) ?? climb[climb.length - 1];
}

export interface PlayerUpdate {
  before: RatedPlayer;
  after: RatedPlayer;
  /** 표시 점수 변화 */
  delta: number;
  /** 그중 승급·연승 보너스 */
  bonus: number;
}

export interface RatingChange {
  winner: PlayerUpdate;
  loser: PlayerUpdate;
  /** 고단자 이변 규칙이 적용됐는가 */
  upset: boolean;
}

/** 한 판의 결과로 두 사람의 새 점수를 계산한다(순수 함수, 정수 점수). */
export function rateGame(winner: RatedPlayer, loser: RatedPlayer, params: RatingParams = DEFAULT_RATING_PARAMS): RatingChange {
  const ew = expectedScore(winner.mmr, loser.mmr, params.scale);
  const upset = loser.rating >= params.upsetRating && winner.mmr < loser.mmr;
  const m = upset ? params.upsetMultiplier : 1;
  const kW = kFactor(winner.games, params.kSchedule);
  const kL = kFactor(loser.games, params.kSchedule);
  // 이변일 때는 두 사람 모두 패자(고단자)의 K로 같은 양을 주고받는다(제로섬)
  const mmrGain = Math.max(1, Math.round((upset ? kL : kW) * m * (1 - ew)));
  const mmrLoss = Math.max(1, Math.round(kL * m * (1 - ew)));

  // 승자
  const wMmr = winner.mmr + mmrGain;
  const wStreak = winner.winStreak + 1;
  let wBonus = 0;
  if (winner.rating < winner.mmr) {
    wBonus = Math.round(climbStep(winner.rating, params.climb).winBonus * streakMultiplier(wStreak));
  }
  const wRating = Math.max(params.floor, Math.min(wMmr, winner.rating + mmrGain + wBonus));

  // 패자
  const lMmr = Math.max(params.floor, loser.mmr - mmrLoss);
  const lossFactor = loser.rating < loser.mmr ? climbStep(loser.rating, params.climb).lossFactor : 1;
  const lRating = Math.max(params.floor, Math.min(lMmr, loser.rating - Math.round(mmrLoss * lossFactor)));

  const wAfter: RatedPlayer = { rating: wRating, mmr: wMmr, games: winner.games + 1, winStreak: wStreak };
  const lAfter: RatedPlayer = { rating: lRating, mmr: lMmr, games: loser.games + 1, winStreak: 0 };
  return {
    winner: { before: winner, after: wAfter, delta: wRating - winner.rating, bonus: Math.max(0, wRating - winner.rating - mmrGain) },
    loser: { before: loser, after: lAfter, delta: lRating - loser.rating, bonus: 0 },
    upset,
  };
}

/**
 * 재보정: 실제 분포에서 2500점 이상 비율이 목표에서 벗어났을 때,
 * 중간값(MMR_START)을 기준으로 실력 점수 폭을 factor배로 늘리거나 줄인다. 순위는 바뀌지 않는다.
 * 표시 점수가 실력 점수를 넘지 않도록 함께 맞춘다.
 */
export function rescale(p: RatedPlayer, factor: number, center = MMR_START, floor = RATING_FLOOR): RatedPlayer {
  const mmr = Math.max(floor, Math.round(center + (p.mmr - center) * factor));
  const converged = p.rating >= p.mmr;
  return { ...p, mmr, rating: converged ? mmr : Math.min(p.rating, mmr) };
}

/** 9단(2500점 이상) 목표 비율: 전체(1판 이상 둔) 유저의 0.05% ~ 0.1%. */
export const TOP_SHARE_BAND = Object.freeze({ min: 0.0005, max: 0.001 });
export const TOP_MMR = 2500;
/** 보정 1회당 최대 조정 폭(점수 급변 방지) */
export const MAX_RESCALE_STEP = 0.05;
/** 이 인원 미만이면 비율이 의미가 없으므로 보정하지 않는다 */
export const MIN_CALIBRATION_PLAYERS = 2000;

/**
 * 정기 보정: 실력 점수 분포에서 2500점 이상 비율이 목표 범위를 벗어났으면,
 * 범위 가운데(0.075%) 분위가 2500점에 오도록 하는 배율을 돌려준다(최대 ±5%). 범위 안이면 null.
 * 신규·기존 유저 K 차이 때문에 분포 폭이 시간에 따라 서서히 넓어지는 것을 되돌린다.
 */
export function calibrationFactor(mmrs: readonly number[], center = MMR_START): number | null {
  if (mmrs.length < MIN_CALIBRATION_PLAYERS) return null;
  const share = mmrs.filter((m) => m >= TOP_MMR).length / mmrs.length;
  if (share >= TOP_SHARE_BAND.min && share <= TOP_SHARE_BAND.max) return null;
  const sorted = [...mmrs].sort((a, b) => a - b);
  const target = (TOP_SHARE_BAND.min + TOP_SHARE_BAND.max) / 2;
  const q = sorted[Math.min(sorted.length - 1, Math.floor((1 - target) * sorted.length))];
  if (q <= center) return 1 + MAX_RESCALE_STEP;
  const raw = (TOP_MMR - center) / (q - center);
  return Math.min(1 + MAX_RESCALE_STEP, Math.max(1 - MAX_RESCALE_STEP, raw));
}
