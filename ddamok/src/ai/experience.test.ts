import { describe, expect, it } from "vitest";
import { createGame, tryMove, type GameState, type Position } from "../game/index.ts";
import { experienceBonus, forgetAll, learnFromGame, positionKey } from "./experience.ts";

function play(state: GameState, moves: Position[]): GameState {
  for (const m of moves) {
    const r = tryMove(state, m);
    if (!r.ok) throw new Error(r.reason);
    state = r.state;
  }
  return state;
}

describe("경험", () => {
  it("진 쪽의 수는 그 자리에서 깎이고, 이긴 쪽의 수는 조금 더해진다", () => {
    forgetAll();
    const start = createGame(15);
    const moves: Position[] = [];
    for (let i = 0; i < 5; i++) moves.push({ row: 7, col: 7 + i }, { row: 0, col: i * 2 });
    moves.pop(); // 흑이 5목으로 끝
    const end = play(start, moves);
    expect(end.winner).toBe("black");
    learnFromGame(end);
    const afterBlack1 = play(start, moves.slice(0, 1));
    expect(experienceBonus(positionKey(afterBlack1), 0 * 15 + 0)).toBeLessThan(0); // 백의 첫 수(0,0)는 진 수
    expect(experienceBonus(positionKey(start), 7 * 15 + 7)).toBeGreaterThan(0); // 흑의 첫 수는 이긴 수
    expect(experienceBonus(positionKey(start), 3 * 15 + 3)).toBe(0);
  });
});
