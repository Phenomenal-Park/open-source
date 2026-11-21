// 경험: 진 판의 수순을 기억해 같은 자리에서 같은 수를 되풀이하지 않는다(이긴 수는 조금 더 믿는다).
// 판이 끝나면 learnFromGame으로 그 판의 수를 "그 수를 둔 쪽이 본 판" 기준으로 기억하고,
// 수를 고를 때 experienceBonus로 점수를 고친다. 기억은 이 실행(브라우저 탭·측정 프로그램) 안에서만 산다.
import type { GameState, Player, Position } from "../game/types.ts";
import { createGameFromConfig } from "../game/gameState.ts";
import { scanAt, tryMove, viewFor } from "../game/rules.ts";

/** 판 + 차례 + 따낸 수 + 숨은 돌을 아는지 → 수 → (이긴 횟수 − 진 횟수) */
const memory = new Map<string, Map<number, number>>();
const MAX_KEYS = 50_000;

/** 진 수 하나당 깎는 점수(형세 점수 단위). 열린 3이 160, 4가 2200 정도라 비슷한 수끼리만 순서를 바꾼다 */
export const LEARN_WEIGHT = 300;

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
  if (!final.isFinished || !final.winner) return;
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
    row.set(p, (row.get(p) ?? 0) + (side === final.winner ? 1 : -1));
    const r = tryMove(s, m, undefined, { hidden: i === hiddenIndex });
    if (!r.ok) return;
    s = r.state;
  }
}

/** 테스트용 */
export function forgetAll(): void {
  memory.clear();
}
