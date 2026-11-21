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

import { fastChooseMove } from "./fastSearch.ts";
import { levelById } from "./levels.ts";

describe("질 것 같아도 버틴다", () => {
  it("막을 수 없는 열린 4 앞에서도 한쪽 끝을 막는다(엉뚱한 곳에 두지 않는다)", () => {
    let s = createGame(15);
    for (const m of [[7, 7], [5, 4], [0, 0], [5, 5], [0, 2], [5, 6], [0, 4], [5, 7], [14, 14]]) {
      const r = tryMove(s, { row: m[0], col: m[1] });
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    // 백 차례가 아니라 흑 차례가 되도록 한 수 더(백) — 백 5,4~5,7 열린 4, 흑 차례
    const r = tryMove(s, { row: 13, col: 13 });
    if (!r.ok) throw new Error(r.reason);
    const m = fastChooseMove(r.state, levelById("ai-8")!.fast!);
    expect(["5,3", "5,8"]).toContain(`${m.row},${m.col}`);
  }, 30_000);
});
