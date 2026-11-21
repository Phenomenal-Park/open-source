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

describe("비슷한 수 흔들기(vary)", () => {
  it("열린 3을 안 막는 수를 고르지 않는다(짧은 읽기가 모두 진다고 볼 때 흔들지 않는다)", () => {
    // 백 7,4 8,5 9,6 열린 3 — 6,3 또는 10,7로 막아야 한다(11,8은 6,3에 열린 4를 내준다)
    let s = createGame(15, { hiddenMove: true, captureTarget: { black: 10, white: 10 } });
    for (const [r, c] of [[7, 7], [8, 5], [6, 6], [5, 5], [8, 8], [9, 6], [9, 7], [7, 4]]) {
      const t = tryMove(s, { row: r, col: c });
      if (!t.ok) throw new Error(t.reason);
      s = t.state;
    }
    const L = levelById("ai-8")!.fast!;
    for (let i = 0; i < 8; i++) {
      const m = fastChooseMove(s, L);
      expect([[6, 3], [10, 7]]).toContainEqual([m.row, m.col]);
    }
  }, 30_000);
});
