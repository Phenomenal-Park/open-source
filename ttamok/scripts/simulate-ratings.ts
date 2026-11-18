// ELO 보정 시뮬레이션: "2500점(9단) 이상이 전체 유저의 몇 %인가"를 추정한다.
//
// 가정(실제 데이터가 쌓이면 교체):
//  - 유저의 실제 실력 θ ~ 정규분포(0, σ) [로짓 단위]. A가 B를 이길 확률 = 1/(1+e^-(θA−θB)).
//    σ=2.0은 체스 인구(상위 0.05%가 중앙값 유저를 약 99.9% 이김)와 비슷한 폭이다.
//  - 유저는 시간에 따라 계속 가입하고, 활동량은 제각각(대부분 적게, 일부는 아주 많이).
//  - 매칭은 점수가 비슷한 사람끼리.
//
// 사용: node scripts/simulate-ratings.ts [scale] [sigma] [players] [seed]
import { DEFAULT_RATING_PARAMS, INITIAL_RATING, rateGame, type RatingParams } from "../src/rating/elo.ts";
import { RANKS, rankFor, TOP_RANK } from "../src/rating/ranks.ts";

export interface SimOptions {
  scale: number;
  sigma: number;
  players: number;
  rounds: number;
  seed: number;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(opts: SimOptions) {
  const rand = mulberry32(opts.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const params: RatingParams = { ...DEFAULT_RATING_PARAMS, scale: opts.scale };

  interface P { skill: number; rating: number; games: number; activity: number; joined: number }
  const pop: P[] = [];
  const perRound = opts.players / opts.rounds; // 꾸준한 신규 가입
  let joined = 0;

  for (let round = 0; round < opts.rounds; round++) {
    joined += perRound;
    while (pop.length < joined) {
      // 활동량: 로그정규 — 대부분 한 라운드에 거의 안 두고, 소수가 많이 둔다
      pop.push({ skill: gauss() * opts.sigma, rating: INITIAL_RATING, games: 0, activity: Math.min(1, 0.05 * Math.exp(gauss() * 1.2)), joined: round });
    }
    // 이번 라운드에 두는 사람
    const active = pop.filter((p) => rand() < p.activity);
    // 비슷한 점수끼리(약간의 무작위성) 짝짓기
    active.sort((a, b) => a.rating + gauss() * 60 - (b.rating + gauss() * 60));
    for (let i = 0; i + 1 < active.length; i += 2) {
      const a = active[i], b = active[i + 1];
      const pA = 1 / (1 + Math.exp(-(a.skill - b.skill)));
      const [w, l] = rand() < pA ? [a, b] : [b, a];
      const ch = rateGame(w, l, params);
      w.rating = ch.winner.after; l.rating = ch.loser.after;
      w.games++; l.games++;
    }
  }

  const playedAny = pop.filter((p) => p.games > 0);
  const share = (list: P[]) => list.filter((p) => p.rating >= TOP_RANK.minRating).length / list.length;
  const dist = RANKS.map((r) => ({ label: r.label, n: 0 }));
  for (const p of playedAny) dist[rankFor(p.rating).index].n++;
  const sorted = playedAny.map((p) => p.rating).sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    total: pop.length,
    played: playedAny.length,
    topShareAll: share(pop),
    topShareActive: share(playedAny),
    median: pct(0.5),
    p90: pct(0.9),
    p99: pct(0.99),
    p9995: pct(0.9995),
    max: sorted[sorted.length - 1],
    dist,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [scale = String(DEFAULT_RATING_PARAMS.scale), sigma = "2", players = "100000", seed = "1"] = process.argv.slice(2);
  const r = simulate({ scale: +scale, sigma: +sigma, players: +players, rounds: 1500, seed: +seed });
  console.log(`scale=${scale} σ=${sigma} 가입 ${r.total}명, 1판 이상 ${r.played}명`);
  console.log(`9단(≥${TOP_RANK.minRating}) 비율: 전체 ${(r.topShareAll * 100).toFixed(3)}% · 1판 이상 둔 유저 중 ${(r.topShareActive * 100).toFixed(3)}%`);
  console.log(`점수 분위: 중앙 ${r.median} · 상위10% ${r.p90} · 상위1% ${r.p99} · 상위0.05% ${r.p9995} · 최고 ${r.max}`);
  console.log(r.dist.map((d) => `${d.label} ${((d.n / r.played) * 100).toFixed(2)}%`).join(" | "));
}
