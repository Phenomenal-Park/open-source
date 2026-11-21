import { describe, expect, it } from "vitest";
import { createGame, tryMove } from "../game/index.ts";
import { FastBoard } from "./fast.ts";
import { FastSearcher } from "./fastSearch.ts";

describe("탐색 가장자리", () => {
  it("볼 후보가 하나도 없으면 빈 결과를 돌려준다(오류로 멈추지 않는다)", () => {
    const s = tryMove(createGame(15), { row: 7, col: 7 });
    if (!s.ok) throw new Error(s.reason);
    const r = new FastSearcher(FastBoard.fromState(s.state), 10).searchRoot(4, 50, true, true, []);
    expect(r.scores).toEqual([]);
  });
});
