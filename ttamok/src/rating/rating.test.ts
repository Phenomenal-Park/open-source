import { describe, expect, it } from "vitest";
import {
  calibrationFactor, expectedScore, MIN_CALIBRATION_PLAYERS, MMR_START, newRatedPlayer, rankFor, RANKS,
  rateGame, rescale, streakMultiplier, pointsToNextRank, type RatedPlayer,
} from "./index.ts";

const p = (rating: number, mmr: number, games = 50, winStreak = 0): RatedPlayer => ({ rating, mmr, games, winStreak });

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

describe("ELO", () => {
  it("신규 유저: 표시 500점(18급), 실력 점수 1500점", () => {
    expect(newRatedPlayer()).toEqual({ rating: 500, mmr: MMR_START, games: 0, winStreak: 0 });
  });

  it("기대 승률은 점수가 같으면 0.5, 높을수록 크다", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(expectedScore(1800, 1500)).toBeGreaterThan(0.8);
  });

  it("초반(1000점 미만)에는 이기면 크게 오르고 져도 표시 점수를 잃지 않는다", () => {
    const a = newRatedPlayer(), b = newRatedPlayer();
    const r = rateGame(a, b);
    expect(r.winner.after.mmr).toBe(1532);          // K 64 × 0.5
    expect(r.winner.after.rating).toBe(500 + 32 + 80); // + 승급 보너스 80
    expect(r.winner.bonus).toBe(80);
    expect(r.loser.after.mmr).toBe(1468);
    expect(r.loser.after.rating).toBe(500);           // 1000점 미만은 잃지 않음
  });

  it("1000~1500점 구간: 보너스 +50, 지면 절반만 잃는다", () => {
    const r = rateGame(p(1200, 1700, 50), p(1200, 1700, 50));
    expect(r.winner.after.rating).toBe(1200 + 12 + 50);
    expect(r.loser.after.rating).toBe(1200 - 6);
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
    const near = rateGame(p(1590, 1600, 50, 3), p(1600, 1600, 50));
    expect(near.winner.after.rating).toBe(near.winner.after.mmr);
    const conv = rateGame(p(1800, 1800), p(1800, 1800));
    expect(conv.winner.delta).toBe(12);
    expect(conv.winner.bonus).toBe(0);
    expect(conv.loser.delta).toBe(-12);
  });

  it("7단 이상이 낮은 상대에게 지면 훅 깎이고, 같은 만큼 상대가 오른다(제로섬)", () => {
    const normal = rateGame(p(2000, 2000), p(2350, 2350)); // 고단자 패배, 이변 규칙
    expect(normal.upset).toBe(true);
    const plain = rateGame(p(2000, 2000), p(2250, 2250));  // 6단은 적용 안 됨
    expect(plain.upset).toBe(false);
    expect(-normal.loser.delta).toBeGreaterThan(2 * -plain.loser.delta);
    expect(normal.winner.after.mmr - 2000).toBe(2350 - normal.loser.after.mmr);
    // 고단자가 이기면 평소대로
    expect(rateGame(p(2350, 2350), p(2000, 2000)).upset).toBe(false);
  });

  it("하한은 0점", () => {
    const r = rateGame(p(10, 10), p(10, 10)); // 패자 −12 → 0에서 멈춤
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
