// AI 단계별 기력 측정: 두 단계를 흑백 번갈아 N판 두게 하고 승률 → 점수 차(실력 점수 공식, SCALE 350)로 바꾼다.
// 사용: node scripts/calibrate-ai.ts <약한 단계 번호> <강한 단계 번호> [판 수] [seed]
//   예) node scripts/calibrate-ai.ts 0 1 40
// 결과의 "점수 차"를 이어 붙이면 단계 사다리가 된다. 가장 약한 단계를 18급(500점)으로 놓는 것은 추정이다.
// 각 판은 무작위 시작 3수(가운데 5×5)에서 출발하고, 같은 시작으로 흑백을 바꿔 두 번 둔다
// (무작위성이 없는 강한 AI끼리는 그렇지 않으면 같은 판만 반복된다).
import { readFileSync } from "node:fs";
import { createGame } from "../src/game/gameState.ts";
import { tryMove } from "../src/game/rules.ts";
import type { GameState } from "../src/game/types.ts";
import { AI_LEVELS, chooseMove, type AiLevel } from "../src/ai/index.ts";
import { EXPERIMENTAL } from "../src/ai/levels.ts";

const ALL = [...AI_LEVELS, ...EXPERIMENTAL];
/** "x-tuned:경로.json" = 챌린저 설정 + 그 파일의 형세 가중치(자동 조정 실험용) */
const pick = (x: string): AiLevel => {
  if (x.startsWith("x-tuned:")) {
    const base = EXPERIMENTAL.find((l) => l.id === "x-fast")!;
    return { ...base, id: x, name: x, fast: { ...base.fast!, weights: JSON.parse(readFileSync(x.slice(8), "utf8")) } };
  }
  return /^\d+$/.test(x) ? ALL[+x] : ALL.find((l) => l.id === x || l.label === x)!;
};
import { RATING_SCALE } from "../src/rating/elo.ts";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 무작위 시작 수(가운데 5×5 안) — 무작위성이 없는 강한 AI끼리도 서로 다른 판이 나오게 한다. */
export function randomOpening(rand: () => number, moves = 3): GameState {
  let s = createGame(15);
  while (s.moveCount < moves) {
    const r = tryMove(s, { row: 5 + Math.floor(rand() * 5), col: 5 + Math.floor(rand() * 5) });
    if (r.ok) s = r.state;
  }
  return s;
}

export function playGame(black: AiLevel, white: AiLevel, rand: () => number, start: GameState = createGame(15)): GameState {
  let s = start;
  while (!s.isFinished && s.moveCount < 225) {
    const m = chooseMove(s, s.currentPlayer === "black" ? black : white, rand);
    const r = tryMove(s, m);
    if (!r.ok) throw new Error(`AI가 둘 수 없는 수를 골랐다: ${JSON.stringify(m)} (${r.reason})`);
    s = r.state;
  }
  return s;
}

/** 승률 p → 점수 차 */
export function ratingGap(p: number, scale = RATING_SCALE): number {
  const q = Math.min(0.98, Math.max(0.02, p)); // 전승/전패일 때 무한대 방지(하한 추정)
  return scale * Math.log10(q / (1 - q));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a = "0", b = "1", n = "40", seed = "7"] = process.argv.slice(2);
  const weak = pick(a), strong = pick(b);
  const rand = mulberry32(+seed);
  let strongScore = 0, five = 0, capture = 0, moves = 0;
  const t = performance.now();
  let opening = randomOpening(rand);
  for (let i = 0; i < +n; i++) {
    // 같은 시작 수로 흑백을 바꿔 두 판씩
    const strongIsBlack = i % 2 === 0;
    if (strongIsBlack) opening = randomOpening(rand);
    const g = playGame(strongIsBlack ? strong : weak, strongIsBlack ? weak : strong, rand, opening);
    moves += g.moveCount;
    if (!g.winner) { strongScore += 0.5; continue; }
    if (g.winReason === "five") five++; else capture++;
    if ((g.winner === "black") === strongIsBlack) strongScore++;
  }
  const p = strongScore / +n;
  console.log(JSON.stringify({
    weak: weak.label, strong: strong.label, games: +n, strongWinRate: +p.toFixed(3),
    gap: Math.round(ratingGap(p)), fiveWins: five, captureWins: capture, avgMoves: Math.round(moves / +n),
    seconds: Math.round((performance.now() - t) / 1000),
  }));
}
