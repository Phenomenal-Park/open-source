// 점수 체계 보정 시뮬레이션.
//
// 가정(실제 데이터가 쌓이면 교체):
//  - 유저의 실제 실력 θ ~ 정규분포(0, σ) [로짓 단위]. A가 B를 이길 확률 = 1/(1+e^-(θA−θB)).
//    σ=2.0은 체스 인구(상위 0.05%가 중앙값 유저를 약 99.9% 이김)와 비슷한 폭이다.
//  - 유저는 시간에 따라 꾸준히 가입하고, 활동량은 제각각(대부분 적게, 일부는 아주 많이).
//  - 매칭은 실력 점수(mmr)가 비슷한 사람끼리.
//
// 사용: node scripts/simulate-ratings.ts [scale] [sigma] [rounds] [seed]
//   환경변수: SIM_CALIBRATE=0 (정기 보정 끄기), SIM_K=64,40,24 (K 표), SIM_JOINS=40 (라운드당 가입)
import { calibrationFactor, DEFAULT_RATING_PARAMS, newRatedPlayer, rateGame, rescale, type RatedPlayer, type RatingParams } from "../src/rating/elo.ts";
import { RANKS, rankFor, TOP_RANK } from "../src/rating/ranks.ts";

export interface SimOptions {
  scale: number;
  sigma: number;
  rounds: number;
  joinsPerRound: number;
  seed: number;
  calibrate: boolean;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimPlayer extends RatedPlayer { skill: number; activity: number }

export function simulate(opts: SimOptions) {
  const rand = mulberry32(opts.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const params: RatingParams = { ...DEFAULT_RATING_PARAMS, scale: opts.scale };
  if (process.env.SIM_K) {
    const ks = process.env.SIM_K.split(",").map(Number);
    params.kSchedule = [{ untilGames: 10, k: ks[0] }, { untilGames: 30, k: ks[1] }, { untilGames: Infinity, k: ks[2] }];
  }
  const pop: SimPlayer[] = [];
  const snapshots: { round: number; topShare: number; median: number }[] = [];
  let calibrations = 0;

  for (let round = 1; round <= opts.rounds; round++) {
    for (let j = 0; j < opts.joinsPerRound; j++) {
      // 활동량: 로그정규 — 라운드당 대국 확률. 중앙값 5%, 일부는 매 라운드 둔다.
      pop.push({ ...newRatedPlayer(), skill: gauss() * opts.sigma, activity: Math.min(1, 0.05 * Math.exp(gauss() * 1.2)) });
    }
    const active = pop.filter((p) => rand() < p.activity);
    active.sort((a, b) => a.mmr + gauss() * 50 - (b.mmr + gauss() * 50));
    for (let i = 0; i + 1 < active.length; i += 2) {
      const a = active[i], b = active[i + 1];
      const aWins = rand() < 1 / (1 + Math.exp(-(a.skill - b.skill)));
      const [w, l] = aWins ? [a, b] : [b, a];
      const ch = rateGame(w, l, params);
      Object.assign(w, ch.winner.after);
      Object.assign(l, ch.loser.after);
    }
    // 서버의 정기 보정(하루 1회 가정 = 50라운드마다)
    if (opts.calibrate && round % 50 === 0) {
      const played = pop.filter((p) => p.games > 0);
      const f = calibrationFactor(played.map((p) => p.mmr));
      if (f !== null) { for (const p of played) Object.assign(p, rescale(p, f)); calibrations++; }
    }
    if (round % Math.max(1, Math.floor(opts.rounds / 6)) === 0) {
      const played = pop.filter((p) => p.games > 0);
      snapshots.push({ round, topShare: share(played), median: median(played.map((p) => p.rating)) });
    }
  }

  const played = pop.filter((p) => p.games > 0);
  const regular = pop.filter((p) => p.games >= 20);
  const dist = RANKS.map((r) => ({ label: r.label, n: 0 }));
  for (const p of played) dist[rankFor(p.rating).index].n++;
  const ratings = played.map((p) => p.rating).sort((x, y) => x - y);
  const gamesToConverge = played.filter((p) => p.rating >= p.mmr).length / played.length;
  return {
    joined: pop.length,
    played: played.length,
    regular: regular.length,
    topShare: share(played),
    topShareRegular: share(regular),
    topShareMmr: played.filter((p) => p.mmr >= TOP_RANK.minRating).length / played.length,
    medianRating: median(ratings),
    medianRatingRegular: median(regular.map((p) => p.rating)),
    medianMmr: median(played.map((p) => p.mmr)),
    medianGames: median(played.map((p) => p.games)),
    convergedShare: gamesToConverge,
    p99: ratings[Math.floor(0.99 * ratings.length)],
    max: ratings[ratings.length - 1],
    dist,
    snapshots,
    calibrations,
  };
}

function share(list: RatedPlayer[]): number {
  return list.length ? list.filter((p) => p.rating >= TOP_RANK.minRating).length / list.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [scale = String(DEFAULT_RATING_PARAMS.scale), sigma = "2", rounds = "1500", seed = "1"] = process.argv.slice(2);
  const r = simulate({ scale: +scale, sigma: +sigma, rounds: +rounds, joinsPerRound: Number(process.env.SIM_JOINS ?? 40), seed: +seed, calibrate: process.env.SIM_CALIBRATE !== "0" });
  const pct = (x: number) => `${(x * 100).toFixed(3)}%`;
  console.log(`SCALE=${scale} σ=${sigma} 라운드 ${rounds} · 가입 ${r.joined}명 · 1판 이상 ${r.played}명 · 20판 이상 ${r.regular}명 · 대국 수 중앙값 ${r.medianGames}`);
  console.log(`9단(≥${TOP_RANK.minRating}) 비율: 1판 이상 유저 ${pct(r.topShare)} · 20판 이상 ${pct(r.topShareRegular)} · (실력 점수 기준 ${pct(r.topShareMmr)})`);
  console.log(`표시 점수 중앙값: 1판 이상 ${r.medianRating} (${rankFor(r.medianRating).label}) · 20판 이상 ${r.medianRatingRegular} (${rankFor(r.medianRatingRegular).label}) · 실력 점수 중앙값 ${r.medianMmr}`);
  console.log(`실력 점수까지 따라잡은 유저 ${pct(r.convergedShare)} · 상위 1% ${r.p99} · 최고 ${r.max}`);
  console.log(`정기 보정 적용 ${r.calibrations}회`);
  console.log(`시간 경과: ${r.snapshots.map((s) => `${s.round}R 9단 ${pct(s.topShare)}/중앙 ${s.median}`).join(" → ")}`);
  console.log(r.dist.map((d) => `${d.label} ${((d.n / r.played) * 100).toFixed(1)}%`).join(" | "));
}
