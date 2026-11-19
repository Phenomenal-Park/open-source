// 따목 점수 체계 — "실력 점수(MMR, 글리코)" + "표시 점수" 2단 구조.
//
// ■ 실력 점수(mmr, 비공개) — 글리코(Glicko-1)
//   점수와 함께 "불확실도(rd)"를 가진다. 새 유저는 rd 350(아주 불확실)에서 시작한다.
//   - rd가 클수록 한 판에 크게 움직인다(초반 변동폭이 굉장히 크다: 한 판 100~170점).
//   - 상대의 rd가 클수록(상대 점수가 확정되지 않았을수록) 그 판의 결과를 덜 믿는다
//     → 확정된 고수가 "?" 유저에게 져도 조금만 깎인다.
//   - 판을 둘수록 rd가 줄어 RD_MIN(60)까지 내려간다. rd > PROVISIONAL_RD(95, 약 10판)이면 "확정 전"(점수 뒤에 ?).
//   기대 승률 E = 1 / (1 + 10^(−g(rd상대)·(내 mmr − 상대 mmr) / SCALE)),  g(rd) = 1/√(1 + 3q²rd²/π²),  q = ln10/SCALE
//   모든 신규 유저는 MMR_START(1500, 전체 중간값 = 3급 부근)에서 시작한다.
//   → 중간값 ≈ 1500(5급~1단 사이). 9단(2500점 이상) 0.05~0.1%는 정기 보정으로 유지(scripts/simulate-ratings.ts).
//
// ■ 표시 점수(rating, 공개 = 급·단)
//   모든 신규 유저는 500점(18급)에서 시작해 자기 실력 점수까지 빠르게 올라간다.
//   - 표시 점수 < 실력 점수인 동안(= 아직 올라가는 중):
//       승리: 실력 점수 변화 + 승급 보너스(1000점 미만 +80, 1500점 미만 +50, 그 위 +25) × 연승 배율
//       연승 배율: 2연승 ×1.25, 3연승 ×1.5, 4연승 ×1.75, 5연승 이상 ×2
//       패배: 1000점 미만은 잃지 않음, 1500점 미만은 절반만 잃음
//   - 표시 점수는 실력 점수를 넘지 않는다. 따라잡은 뒤에는 실력 점수와 똑같이 움직인다.
// ■ 고단자 이변 규칙
//   표시 점수 7단(2300점) 이상이 실력 점수가 더 낮은 "확정된" 상대에게 지면, 그 판의 점수 이동을 UPSET_MULTIPLIER배로 키운다.
//   이긴 쪽이 아직 "?"(확정 전)이면 적용하지 않는다(상대 실력이 확정되지 않았으므로 조금만 깎는다).
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

/** 글리코 불확실도: 시작 350(아주 불확실) → 최소 60. 95 초과면 확정 전("?"), 약 10판이면 확정. */
export const RD_START = 350;
export const RD_MIN = 60;
export const PROVISIONAL_RD = 95;

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
  rdMin: number;
  provisionalRd: number;
  climb: readonly ClimbStep[];
  upsetRating: number;
  upsetMultiplier: number;
}

export const DEFAULT_RATING_PARAMS: RatingParams = Object.freeze({
  scale: RATING_SCALE,
  floor: RATING_FLOOR,
  rdMin: RD_MIN,
  provisionalRd: PROVISIONAL_RD,
  climb: CLIMB_SCHEDULE,
  upsetRating: UPSET_RATING,
  upsetMultiplier: UPSET_MULTIPLIER,
});

export interface RatedPlayer {
  /** 표시 점수 */
  rating: number;
  /** 실력 점수(비공개) */
  mmr: number;
  /** 실력 점수의 불확실도(글리코 RD) */
  rd: number;
  /** 지금까지 둔 랭크 대국 수(이번 대국 제외) */
  games: number;
  /** 현재 연승 수(이번 대국 제외) */
  winStreak: number;
}

export function newRatedPlayer(): RatedPlayer {
  return { rating: INITIAL_RATING, mmr: MMR_START, rd: RD_START, games: 0, winStreak: 0 };
}

/** 점수가 아직 확정되지 않았는가(표시 점수 뒤에 "?") */
export function isProvisional(p: Pick<RatedPlayer, "rd">, provisionalRd = PROVISIONAL_RD): boolean {
  return p.rd > provisionalRd;
}

const gOf = (rd: number, scale: number) => {
  const q = Math.LN10 / scale;
  return 1 / Math.sqrt(1 + (3 * q * q * rd * rd) / (Math.PI * Math.PI));
};

/** 기대 승률(상대 rd를 반영). opponentRd 0이면 일반 ELO와 같다. */
export function expectedScore(mmr: number, opponentMmr: number, scale = RATING_SCALE, opponentRd = 0): number {
  return 1 / (1 + Math.pow(10, (-gOf(opponentRd, scale) * (mmr - opponentMmr)) / scale));
}

/** 글리코-1 한 판 갱신: 새 mmr(실수)과 rd. */
export function glickoUpdate(me: Pick<RatedPlayer, "mmr" | "rd">, opp: Pick<RatedPlayer, "mmr" | "rd">, score: 0 | 1, params: RatingParams = DEFAULT_RATING_PARAMS) {
  const q = Math.LN10 / params.scale;
  const g = gOf(opp.rd, params.scale);
  const e = expectedScore(me.mmr, opp.mmr, params.scale, opp.rd);
  const d2 = 1 / (q * q * g * g * e * (1 - e));
  const denom = 1 / (me.rd * me.rd) + 1 / d2;
  return { mmr: me.mmr + (q / denom) * g * (score - e), rd: Math.max(params.rdMin, Math.sqrt(1 / denom)) };
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
  // 이변: 확정된 7단 이상이, 실력 점수가 더 낮은 "확정된" 상대에게 짐
  const upset = loser.rating >= params.upsetRating && winner.mmr < loser.mmr && !isProvisional(winner, params.provisionalRd);
  const m = upset ? params.upsetMultiplier : 1;
  const w = glickoUpdate(winner, loser, 1, params);
  const l = glickoUpdate(loser, winner, 0, params);
  const mmrGain = Math.max(1, Math.round((w.mmr - winner.mmr) * m));
  const mmrLoss = Math.max(0, Math.round((loser.mmr - l.mmr) * m));

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

  const wAfter: RatedPlayer = { rating: wRating, mmr: wMmr, rd: Math.round(w.rd), games: winner.games + 1, winStreak: wStreak };
  const lAfter: RatedPlayer = { rating: lRating, mmr: lMmr, rd: Math.round(l.rd), games: loser.games + 1, winStreak: 0 };
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
 * 신규 유저의 큰 변동폭 때문에 분포 폭이 시간에 따라 서서히 넓어지는 것을 되돌린다.
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
