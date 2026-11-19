// 형세 가중치 자동 조정(Texel 방식).
//   1) gen: 고속 AI끼리 대국(무작위 시작 3수 + 잡음)하며 조용한 형세의 특징과 최종 결과를 모은다.
//        node scripts/tune-eval.ts gen <판 수> <seed> <출력.json> [가중치.json]
//   2) fit: 모은 데이터로 "형세 점수 → 승률" 예측이 가장 잘 맞는 가중치를 찾는다(로지스틱 회귀, 경사하강).
//        node scripts/tune-eval.ts fit <출력 가중치.json> <데이터1.json> [데이터2.json ...]
// 결과 가중치는 levels.ts의 실험 단계에 넣어 calibrate-ai.ts로 실제 대국 실력을 확인한 뒤에만 채택한다.
import { readFileSync, writeFileSync } from "node:fs";
import { createGame } from "../src/game/gameState.ts";
import { tryMove } from "../src/game/rules.ts";
import type { GameState } from "../src/game/types.ts";
import { FastBoard, FEATURE_COUNT, HAND_WEIGHTS } from "../src/ai/fast.ts";
import { fastChooseMove, type FastLevel } from "../src/ai/fastSearch.ts";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 예측 승률 = 시그모이드(형세 점수 × SCALE) */
const SCALE = 1 / 400;

function gen(games: number, seed: number, out: string, weights?: number[]) {
  const rand = mulberry32(seed);
  const level: FastLevel = { depth: 14, timeMs: 80, width: 12, noise: 40, randomPick: 0, randomPool: 1, missWin: 0, focus: 1, weights };
  const rows: number[][] = [];
  for (let g = 0; g < games; g++) {
    let s: GameState = createGame(15);
    while (s.moveCount < 3) {
      const r = tryMove(s, { row: 5 + Math.floor(rand() * 5), col: 5 + Math.floor(rand() * 5) });
      if (r.ok) s = r.state;
    }
    const samples: { f: number[]; side: "black" | "white" }[] = [];
    while (!s.isFinished && s.moveCount < 225) {
      const b = FastBoard.fromState(s);
      // 조용한 형세만: 양쪽 다 넉 점(바로 이기는 자리)이 없고 포획 승리 직전도 아님
      const quiet = b.fours[1] === 0 && b.fours[2] === 0 && b.target[1] - b.caps[1] > 2 && b.target[2] - b.caps[2] > 2;
      if (quiet && s.moveCount >= 4) samples.push({ f: [...b.features(new Float64Array(FEATURE_COUNT))], side: s.currentPlayer });
      const r = tryMove(s, fastChooseMove(s, level, rand));
      if (!r.ok) throw new Error("illegal");
      s = r.state;
    }
    for (const x of samples) {
      const result = s.winner === null ? 0.5 : s.winner === x.side ? 1 : 0;
      rows.push([...x.f, result]);
    }
  }
  writeFileSync(out, JSON.stringify(rows));
  console.log(`games ${games} positions ${rows.length} → ${out}`);
}

function loss(w: readonly number[], rows: number[][]): number {
  let L = 0;
  for (const r of rows) {
    let z = 0;
    for (let i = 0; i < FEATURE_COUNT; i++) z += w[i] * r[i];
    const p = 1 / (1 + Math.exp(-z * SCALE));
    const y = r[FEATURE_COUNT];
    L += -(y * Math.log(p + 1e-12) + (1 - y) * Math.log(1 - p + 1e-12));
  }
  return L / rows.length;
}

function fit(out: string, files: string[]) {
  const rows: number[][] = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")));
  // 섞어서 80% 학습 / 20% 검증
  const rand = mulberry32(7);
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  const cut = Math.floor(rows.length * 0.8);
  const train = rows.slice(0, cut), valid = rows.slice(cut);
  // 특징마다 크기가 달라 표준화한 공간에서 경사하강
  const mean = new Array(FEATURE_COUNT).fill(0), sd = new Array(FEATURE_COUNT).fill(0);
  for (const r of train) for (let i = 0; i < FEATURE_COUNT; i++) mean[i] += r[i] / train.length;
  for (const r of train) for (let i = 0; i < FEATURE_COUNT; i++) sd[i] += (r[i] - mean[i]) ** 2 / train.length;
  for (let i = 0; i < FEATURE_COUNT; i++) sd[i] = Math.sqrt(sd[i]) || 1;
  // 표준화 공간의 가중치 u: z·SCALE = Σ u_i (x_i - mean_i)/sd_i + b
  const init = process.env.INIT ? JSON.parse(readFileSync(process.env.INIT, "utf8")) as number[] : [...HAND_WEIGHTS];
  while (init.length < FEATURE_COUNT) init.push(0);
  let u = init.map((w, i) => w * SCALE * sd[i]);
  let bias = init.reduce((acc, w, i) => acc + w * SCALE * mean[i], 0);
  const lr = 0.05, l2 = 1e-4;
  for (let epoch = 0; epoch < 3000; epoch++) {
    const g = new Array(FEATURE_COUNT).fill(0);
    let gb = 0;
    for (const r of train) {
      let z = bias;
      for (let i = 0; i < FEATURE_COUNT; i++) z += u[i] * (r[i] - mean[i]) / sd[i];
      const err = 1 / (1 + Math.exp(-z)) - r[FEATURE_COUNT];
      for (let i = 0; i < FEATURE_COUNT; i++) g[i] += err * (r[i] - mean[i]) / sd[i];
      gb += err;
    }
    u = u.map((x, i) => x - lr * (g[i] / train.length + l2 * x));
    bias -= lr * gb / train.length;
  }
  // 원래 공간의 가중치로(평균 이동분 bias는 버린다: 형세 비교에는 상수가 필요 없다)
  const w = u.map((x, i) => Math.round((x / (SCALE * sd[i])) * 10) / 10);
  console.log(`positions ${rows.length} (train ${train.length}, valid ${valid.length})`);
  console.log(`valid loss: init ${loss(init, valid).toFixed(4)} → tuned ${loss(w, valid).toFixed(4)}`);
  console.log("weights", JSON.stringify(w));
  writeFileSync(out, JSON.stringify(w));
}

const [mode, ...args] = process.argv.slice(2);
if (mode === "gen") gen(Number(args[0]), Number(args[1]), args[2], args[3] ? JSON.parse(readFileSync(args[3], "utf8")) : undefined);
else if (mode === "fit") fit(args[0], args.slice(1));
else console.log("usage: gen <games> <seed> <out.json> [weights.json] | fit <out.json> <data...>");
