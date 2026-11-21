// 경험: 진 판의 수순을 기억해 같은 자리에서 같은 수를 되풀이하지 않는다(이긴 수는 조금 더 믿는다).
// 또 상대(백)가 실제로 숨긴 자리를 기억해, 흑이 다음 판에 숨은 돌을 짐작할 때 쓴다.
// 판이 끝나면 learnFromGame으로 그 판의 수를 "그 수를 둔 쪽이 본 판" 기준으로 기억하고,
// 수를 고를 때 experienceBonus로 점수를 고친다. 기억은 이 실행(브라우저 탭·측정 프로그램) 안에서만 산다.
import type { GameState, Player, Position } from "../game/types.ts";
import { createGameFromConfig } from "../game/gameState.ts";
import { scanAt, tryMove, viewFor } from "../game/rules.ts";

/** 판 + 차례 + 따낸 수 + 숨은 돌을 아는지 → 수 → (이긴 횟수 − 진 횟수) */
const memory = new Map<string, Map<number, number>>();
const MAX_KEYS = 50_000;

/** 진 수 하나당 깎는 점수(형세 점수 단위). 열린 3이 160, 4가 2200 정도 — 진 수순은 확실히 피하되 결정적인 수(4·막기)는 그대로 둔다 */
export const LEARN_WEIGHT = 800;

export function positionKey(view: GameState): string {
  const cells = view.board.map((r) => r.map((c) => (c === "black" ? "b" : c === "white" ? "w" : ".")).join("")).join("");
  const h = view.hidden;
  const hid = !h ? "-" : h.index < 0 ? "x" : h.revealed ? "r" : "h";
  return `${view.currentPlayer[0]}${view.capturedByBlack},${view.capturedByWhite}${hid}${view.scan ? (view.scan.hit ? "S" : "s") : ""}|${cells}`;
}

/** 이 자리에서 이 수(p = 행*n+열)를 둔 경험에 따른 점수 보정(진 적이 많으면 음수) */
export function experienceBonus(key: string, p: number): number {
  const net = memory.get(key)?.get(p) ?? 0;
  return net < 0 ? net * LEARN_WEIGHT : net * (LEARN_WEIGHT / 4);
}

/** 끝난 판에서 배운다: 이긴 쪽의 수는 +1, 진 쪽의 수는 −1. 각자 자기가 본 판(숨은 돌은 흑에게 안 보임) 기준 */
export function learnFromGame(final: GameState): void {
  if (!final.isFinished) return;
  const decisive = !!final.winner;
  const n = final.config.boardSize;
  const hiddenIndex = final.hidden && final.hidden.index >= 0 ? final.hidden.index : null;
  let s = createGameFromConfig(final.config);
  for (let i = 0; i < final.moves.length; i++) {
    if (final.scan && final.scan.at === i) {
      const r = scanAt(s, final.scan.pos);
      if (r.ok) s = r.state;
    }
    const side: Player = s.currentPlayer;
    const m: Position = final.moves[i];
    const key = positionKey(viewFor(s, side));
    let row = memory.get(key);
    if (!row) {
      if (memory.size >= MAX_KEYS) memory.delete(memory.keys().next().value!);
      row = new Map();
      memory.set(key, row);
    }
    const p = m.row * n + m.col;
    if (decisive) row.set(p, (row.get(p) ?? 0) + (side === final.winner ? 1 : -1));
    if (i === hiddenIndex) {
      // 상대(백)가 이 판에서 실제로 숨긴 자리 — 흑이 다음에 짐작할 때 쓴다
      const hk = positionKey(s);
      let hr = hides.get(hk);
      if (!hr) { if (hides.size >= MAX_KEYS) hides.delete(hides.keys().next().value!); hr = new Map(); hides.set(hk, hr); }
      hr.set(p, (hr.get(p) ?? 0) + 1);
    }
    const r = tryMove(s, m, undefined, { hidden: i === hiddenIndex });
    if (!r.ok) return;
    s = r.state;
  }
}

/** 백이 실제로 숨긴 자리의 기록: 숨기기 직전 판 → 숨긴 자리 → 횟수 */
const hides = new Map<string, Map<number, number>>();

/** 이 판(백이 숨기기 직전)에서 백이 지난 판들에 실제로 숨긴 자리와 횟수 */
export function hideHistory(before: GameState): Map<number, number> | undefined {
  return hides.get(positionKey(before));
}

/** 테스트용 */
export function forgetAll(): void {
  memory.clear();
  hides.clear();
}
