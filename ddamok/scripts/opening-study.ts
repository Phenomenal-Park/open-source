// 포석 연구: 흑 첫 수(가운데) → 백 응수(옆에 붙임 / 대각) → 흑 두 번째 수 후보별로 AI끼리 끝까지 두어 흑 승률을 잰다.
//   node scripts/opening-study.ts <adjacent|diagonal> <후보당 판 수> <seed> <출력.json> [후보 목록 "dr,dc;dr,dc"]
// 후보를 안 주면 흑 첫 수 주변 7×7의 빈칸 전부(대칭으로 같은 자리는 하나로).
// 결과는 AI(고속 엔진, 한 수 0.1초 + 약간의 무작위) 기준이라 고수의 정답과 다를 수 있다.
import { writeFileSync } from "node:fs";
import { createGame } from "../src/game/gameState.ts";
import { tryMove } from "../src/game/rules.ts";
import type { GameState } from "../src/game/types.ts";
import { fastChooseMove, type FastLevel } from "../src/ai/fastSearch.ts";

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C = 7; // 15×15 가운데
const [reply = "adjacent", per = "16", seedArg = "1", out = "/dev/stdout", list] = process.argv.slice(2);
const white = reply === "diagonal" ? { dr: 1, dc: 1 } : { dr: 0, dc: 1 };

/** 대칭 대표: 백이 옆(0,+1)이면 위아래 뒤집기, 대각(+1,+1)이면 대각선 뒤집기가 같은 판 */
function canon(dr: number, dc: number): string {
  const alt = reply === "diagonal" ? [dc, dr] : [-dr, dc];
  const a = `${dr},${dc}`, b = `${alt[0]},${alt[1]}`;
  return a < b ? a : b;
}

let cands: [number, number][] = [];
if (list) cands = list.split(";").map((x) => x.split(",").map(Number) as [number, number]);
else {
  const seen = new Set<string>();
  for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
    if ((dr === 0 && dc === 0) || (dr === white.dr && dc === white.dc)) continue;
    const k = canon(dr, dc);
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push(k.split(",").map(Number) as [number, number]);
  }
}

const rand = mulberry32(Number(seedArg));
const level: FastLevel = { depth: 14, timeMs: 100, width: 12, noise: 25, randomPick: 0, randomPool: 1, missWin: 0, focus: 1 };
const name = (dr: number, dc: number) => {
  const a = Math.abs(dr), b = Math.abs(dc);
  const [x, y] = [Math.min(a, b), Math.max(a, b)];
  return x === 1 && y === 3 ? "눈목자" : x === 1 && y === 2 ? "날일자" : x === 2 && y === 2 ? "밭전자" : x === 0 && y === 2 ? "한칸뜀" : x === 0 && y === 3 ? "두칸뜀" : x === 1 && y === 1 ? "대각" : x === 0 && y === 1 ? "붙임" : "";
};
const results: { dr: number; dc: number; shape: string; games: number; blackWins: number; whiteWins: number; draws: number }[] = [];
for (const [dr, dc] of cands) {
  let bw = 0, ww = 0, dd = 0;
  for (let g = 0; g < Number(per); g++) {
    let s: GameState = createGame(15);
    for (const p of [{ row: C, col: C }, { row: C + white.dr, col: C + white.dc }, { row: C + dr, col: C + dc }]) s = (tryMove(s, p) as { state: GameState }).state;
    while (!s.isFinished && s.moveCount < 225) s = (tryMove(s, fastChooseMove(s, level, rand)) as { state: GameState }).state;
    if (s.winner === "black") bw++; else if (s.winner === "white") ww++; else dd++;
  }
  results.push({ dr, dc, shape: name(dr, dc), games: Number(per), blackWins: bw, whiteWins: ww, draws: dd });
}
writeFileSync(out, JSON.stringify(results));
