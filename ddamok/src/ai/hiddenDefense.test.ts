import { describe, expect, it } from "vitest";
import { createGame, scanAt, tryMove, viewFor, type GameState, type Position } from "../game/index.ts";
import { levelById } from "./levels.ts";
import { chooseBlackMove } from "./hidden.ts";

function seq(state: GameState, ...moves: (Position | { hidden: Position })[]): GameState {
  for (const m of moves) {
    const r = "hidden" in m ? tryMove(state, m.hidden, undefined, { hidden: true }) : tryMove(state, m);
    if (!r.ok) throw new Error(`illegal ${JSON.stringify(m)}: ${r.reason}`);
    state = r.state;
  }
  return state;
}
const p = (row: number, col: number) => ({ row, col });

describe("흑: 숨은 돌로 바로 오목이 되는 판 막기", () => {
  // 백: 7,8 7,9 7,10 이 보이고 7,11에 숨은 돌 → 7,12에 두면 오목. 흑 눈에는 3목뿐.
  const game = () => seq(createGame(15, { hiddenMove: true, captureTarget: { black: 10, white: 10 } }),
    p(7, 7), p(7, 8), p(0, 0), p(7, 9), p(0, 2), { hidden: p(7, 11) }, p(0, 4), p(7, 10));
  const L = levelById("ai-8")!;

  it("어느 쪽에 숨었든 막는 수를 둔다(헛수 금지)", () => {
    const m = chooseBlackMove(viewFor(game(), "black"), L);
    expect([`${m.row},${m.col}`]).toSatisfy((x: string[]) => ["7,11", "7,12"].includes(x[0]));
  }, 30_000);

  it("스캔이 빗나간 뒤에도 남은 위험 자리를 막는다", () => {
    const r = scanAt(game(), p(7, 12));
    if (!r.ok) throw new Error(r.reason);
    const m = chooseBlackMove(viewFor(r.state, "black"), L);
    expect(m).toEqual(p(7, 11));
  }, 30_000);
});

describe("흑: 외딴 곳에 숨긴 돌로 생기는 오목도 본다", () => {
  it("다른 돌과 멀리 떨어진 숨은 돌로 이어지는 위험 자리를 위험으로 안다", async () => {
    const { hiddenBelief } = await import("./hidden.ts");
    // 백: 3,10 · 4,9 · 5,8 이 보이고 2,11에 숨김 → 1,12에 두면 오목(2,11~5,8 + 1,12). 1,12 둘레엔 다른 돌이 없다.
    const s = seq(createGame(15, { hiddenMove: true, captureTarget: { black: 10, white: 10 } }),
      p(7, 7), { hidden: p(2, 11) }, p(9, 9), p(3, 10), p(9, 7), p(4, 9), p(10, 5), p(5, 8));
    const bel = hiddenBelief(viewFor(s, "black"), 20);
    const c = bel.find((x) => x.pos === 2 * 15 + 11);
    expect(c?.danger1).toBe(true);
  });
});

describe("흑: 한 수로 막을 수 있는 위험엔 스캔을 아낀다", () => {
  it("3목 끝 두 빈칸이 위험할 때 스캔하지 않고 안쪽에 둔다", async () => {
    const { scanDecision } = await import("./hidden.ts");
    const s = seq(createGame(15, { hiddenMove: true, captureTarget: { black: 10, white: 10 } }),
      p(7, 7), p(7, 8), p(0, 0), p(7, 9), p(0, 2), { hidden: p(2, 2) }, p(0, 4), p(7, 10));
    const v = viewFor(s, "black");
    expect(scanDecision(v, levelById("ai-8")!)).toBeNull();
    const m = chooseBlackMove(v, levelById("ai-8")!);
    expect(["7,11", "7,12"]).toContain(`${m.row},${m.col}`);
  }, 30_000);
});
