import { describe, expect, it } from "vitest";
import { createGame, tryMove, type GameState, type Position } from "../game/index.ts";
import { experienceBonus, forgetAll, hideHistory, learnFromGame, positionKey } from "./experience.ts";

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

describe("상대가 숨긴 자리 기록", () => {
  it("끝난 판에서 백이 실제로 숨긴 자리를 숨기기 직전 판 기준으로 기억한다", () => {
    forgetAll();
    let s = createGame(15, { hiddenMove: true });
    s = play(s, [{ row: 7, col: 7 }]);
    const before = s;
    const h = tryMove(s, { row: 5, col: 6 }, undefined, { hidden: true });
    if (!h.ok) throw new Error(h.reason);
    let end = h.state;
    // 흑이 기권한 것처럼 끝낸다(결과와 상관없이 숨긴 자리는 기록)
    end = { ...end, isFinished: true, winner: "white", winReason: "five" };
    learnFromGame(end);
    expect(hideHistory(before)?.get(5 * 15 + 6)).toBe(1);
  });
});
