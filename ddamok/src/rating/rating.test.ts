import { describe, expect, it } from "vitest";
import {
  calibrationFactor, expectedScore, rateDraw, isProvisional, MIN_CALIBRATION_PLAYERS, MMR_START, newRatedPlayer, rankFor, RANKS,
  rateGame, rescale, streakMultiplier, pointsToNextRank, RD_MIN, RD_START, type RatedPlayer,
} from "./index.ts";

/** 기본은 확정된 유저(rd 60) */
const p = (rating: number, mmr: number, games = 50, winStreak = 0, rd = RD_MIN): RatedPlayer => ({ rating, mmr, rd, games, winStreak });
const fresh = (rating = 500, mmr = 1500, games = 0, winStreak = 0) => p(rating, mmr, games, winStreak, RD_START);

describe("급·단 표", () => {
  it("18급(500점)에서 시작해 1급 → 1단 → 9단(2500점)", () => {
    expect(RANKS).toHaveLength(27);
    expect(rankFor(500).label).toBe("18급");
    expect(rankFor(0).label).toBe("18급");
    expect(rankFor(564).label).toBe("18급");
    expect(rankFor(565).label).toBe("17급");
    expect(rankFor(1605).label).toBe("1급");
    expect(rankFor(1699).label).toBe("1급");
    expect(rankFor(1700).label).toBe("1단");
    expect(rankFor(2499).label).toBe("8단");
    expect(rankFor(2500).label).toBe("9단");
    expect(rankFor(4000).label).toBe("9단");
    expect(RANKS.map((r) => r.label).slice(16, 20)).toEqual(["2급", "1급", "1단", "2단"]);
    expect(pointsToNextRank(500)).toEqual({ next: RANKS[1], points: 65 });
    expect(pointsToNextRank(2600)).toBeNull();
  });
});

describe("점수(글리코 + 표시 점수)", () => {
  it("신규 유저: 표시 500점(18급), 실력 점수 1500점, 확정 전(?)", () => {
    expect(newRatedPlayer()).toEqual({ rating: 500, mmr: MMR_START, rd: RD_START, games: 0, winStreak: 0 });
    expect(isProvisional(newRatedPlayer())).toBe(true);
    expect(isProvisional(p(1500, 1500))).toBe(false);
  });

  it("기대 승률은 점수가 같으면 0.5, 높을수록 크다. 상대가 불확실하면 0.5 쪽으로 줄어든다", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(expectedScore(1800, 1500)).toBeGreaterThan(0.8);
    expect(expectedScore(1800, 1500, 350, 350)).toBeLessThan(expectedScore(1800, 1500, 350, 60));
  });

  it("확정 전에는 변동폭이 굉장히 크다(신규끼리 한 판 100점 이상)", () => {
    const r = rateGame(fresh(), fresh());
    expect(r.winner.after.mmr - 1500).toBeGreaterThan(100);
    expect(1500 - r.loser.after.mmr).toBeGreaterThan(100);
    expect(r.winner.after.rd).toBeLessThan(RD_START);
  });

  it("약 10판이면 확정된다(?가 사라짐)", () => {
    let me = fresh();
    let n = 0;
    while (isProvisional(me) && n < 50) {
      const opp = p(me.mmr, me.mmr);
      me = (n % 2 ? rateGame(opp, me).loser.after : rateGame(me, opp).winner.after);
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(12);
  });

  it("확정된 2000점 고수가 '?' 유저에게 지면 조금만 깎인다", () => {
    const pro = p(2050, 2050);
    const vsNew = rateGame(fresh(1500, 1600, 5, 4), pro);         // 상대가 확정 전
    const vsEstablished = rateGame(p(1600, 1600), pro);            // 상대가 확정됨
    expect(-vsNew.loser.delta).toBeLessThan(15);
    expect(-vsNew.loser.delta).toBeLessThan(-vsEstablished.loser.delta);
    // 반면 '?' 유저는 크게 오른다
    expect(vsNew.winner.after.mmr - 1600).toBeGreaterThan(150);
  });

  it("'?' 유저가 고수에게 지면 크게 떨어지지 않는다(예상된 패배)", () => {
    const r = rateGame(p(2050, 2050), fresh(1500, 1600, 5, 4));
    expect(1600 - r.loser.after.mmr).toBeLessThan(40);
    expect(r.loser.after.rating).toBeGreaterThan(1500 - 40);
  });

  it("초반(1000점 미만)에는 이기면 크게 오르고 져도 표시 점수를 잃지 않는다", () => {
    const r = rateGame(fresh(), fresh());
    const gain = r.winner.after.mmr - 1500;
    expect(r.winner.after.rating).toBe(500 + gain + 80);
    expect(r.winner.bonus).toBe(80);
    expect(r.loser.after.rating).toBe(500);
  });

  it("1000~1500점 구간: 보너스 +50, 지면 절반만 잃는다", () => {
    const r = rateGame(p(1200, 1700), p(1200, 1700));
    const gain = r.winner.after.mmr - 1700;
    const loss = 1700 - r.loser.after.mmr;
    expect(r.winner.after.rating).toBe(1200 + gain + 50);
    expect(r.loser.after.rating).toBe(1200 - Math.round(loss * 0.5));
  });

  it("연승하면 보너스가 커진다 (2연승 ×1.25 … 5연승 이상 ×2)", () => {
    expect([1, 2, 3, 4, 5, 9].map(streakMultiplier)).toEqual([1, 1.25, 1.5, 1.75, 2, 2]);
    const first = rateGame(p(600, 1600, 40, 0), p(600, 1600, 40));
    const fifth = rateGame(p(600, 1600, 40, 4), p(600, 1600, 40));
    expect(first.winner.bonus).toBe(80);
    expect(fifth.winner.bonus).toBe(160);
    expect(fifth.winner.after.winStreak).toBe(5);
    expect(fifth.loser.after.winStreak).toBe(0);
  });

  it("표시 점수는 실력 점수를 넘지 않고, 따라잡은 뒤엔 똑같이 움직인다", () => {
    const near = rateGame(p(1590, 1600, 50, 3), p(1600, 1600));
    expect(near.winner.after.rating).toBe(near.winner.after.mmr);
    const conv = rateGame(p(1800, 1800), p(1800, 1800));
    expect(conv.winner.delta).toBe(conv.winner.after.mmr - 1800);
    expect(conv.winner.delta).toBeGreaterThanOrEqual(10); // 확정 유저끼리 비슷한 실력: 한 판 약 11점(이전 K 24와 비슷)
    expect(conv.winner.bonus).toBe(0);
    expect(conv.loser.delta).toBe(-conv.winner.delta);
  });

  it("7단 이상이 확정된 낮은 상대에게 지면 훅 깎인다 — 상대가 '?'면 적용 안 함", () => {
    const upset = rateGame(p(2000, 2000), p(2350, 2350));
    expect(upset.upset).toBe(true);
    const plain = rateGame(p(2000, 2000), p(2250, 2250)); // 6단은 적용 안 됨
    expect(plain.upset).toBe(false);
    expect(-upset.loser.delta).toBeGreaterThan(2 * -plain.loser.delta);
    expect(rateGame(fresh(1500, 2000, 5), p(2350, 2350)).upset).toBe(false);
    expect(rateGame(p(2350, 2350), p(2000, 2000)).upset).toBe(false); // 고단자가 이기면 평소대로
  });

  it("무승부: 실력 점수가 같으면 거의 안 변하고, 낮은 쪽이 오르고 높은 쪽이 내린다. 연승은 끊긴다", () => {
    const even = rateDraw(p(1800, 1800, 50, 3), p(1800, 1800));
    expect(even.a.after.mmr).toBe(1800);
    expect(even.a.after.winStreak).toBe(0);
    expect(even.a.after.games).toBe(51);
    const up = rateDraw(p(1600, 1600), p(2000, 2000));
    expect(up.a.after.mmr).toBeGreaterThan(1600);
    expect(up.b.after.mmr).toBeLessThan(2000);
    expect(up.a.bonus).toBe(0);
    // 올라가는 중(표시 < 실력)인 1000점 미만 유저는 비겨도 표시 점수를 잃지 않는다
    const climbing = rateDraw(p(700, 2000), p(1500, 1500));
    expect(climbing.a.after.rating).toBe(700);
  });

  it("하한은 0점", () => {
    const r = rateGame(p(10, 10), p(10, 10));
    expect(r.loser.after.rating).toBe(0);
    expect(r.loser.after.mmr).toBe(0);
  });
});

describe("정기 보정", () => {
  const population = (n: number, spread: number) =>
    Array.from({ length: n }, (_, i) => MMR_START + spread * Math.tan(Math.PI * ((i + 0.5) / n - 0.5)) * 0.3);

  it("인원이 적거나 9단 비율이 0.05~0.1% 안이면 보정하지 않는다", () => {
    expect(calibrationFactor(population(MIN_CALIBRATION_PLAYERS - 1, 1000))).toBeNull();
    const inBand = Array.from({ length: 10000 }, (_, i) => (i < 8 ? 2600 : 1500)); // 0.08%
    expect(calibrationFactor(inBand)).toBeNull();
  });

  it("9단이 너무 많으면 폭을 줄이고(최대 5%), 너무 적으면 늘린다", () => {
    const many = Array.from({ length: 10000 }, (_, i) => (i < 50 ? 2700 : 1500 + (i % 700)));
    expect(calibrationFactor(many)).toBe(0.95);
    const few = Array.from({ length: 10000 }, (_, i) => 1500 + (i % 900));
    expect(calibrationFactor(few)).toBeGreaterThan(1);
  });

  it("보정은 1500점 기준으로 폭만 바꾸고 순위를 유지한다", () => {
    expect(rescale(p(2600, 2600), 0.9).mmr).toBe(2490);
    expect(rescale(p(2600, 2600), 0.9).rating).toBe(2490);
    expect(rescale(p(1000, 1000), 0.9).mmr).toBe(1050);
    expect(rescale(p(700, 2000), 0.9)).toMatchObject({ rating: 700, mmr: 1950 }); // 올라가는 중인 유저는 표시 점수 유지
    expect(rescale(p(1500, 1500), 1.05).mmr).toBe(1500);
  });
});
