import { describe, expect, it } from "vitest";
import { createGame, tryMove, type GameState, type Position } from "../game/index.ts";
import { fromDiagram } from "../game/testUtils.ts";
import { AI_LEVELS, chooseMove, levelById } from "./index.ts";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}
const steady = AI_LEVELS.filter((l) => l.missWin === 0 && l.randomPick === 0);
const strongest = AI_LEVELS[AI_LEVELS.length - 1];
const key = (p: Position) => `${p.row},${p.col}`;

describe("따목 AI", () => {
  it("단계는 약한 순서대로 6개, 표시는 18급~3급", () => {
    expect(AI_LEVELS.map((l) => l.label)).toEqual(["18급", "16급", "12급", "10급", "7급", "3급"]);
    expect(AI_LEVELS.every((l, i) => i === 0 || l.rating > AI_LEVELS[i - 1].rating)).toBe(true);
    expect(levelById("ai-3")?.label).toBe("12급");
  });

  it("바로 이길 수 있으면 5목을 완성한다", () => {
    const s = fromDiagram(["", "", "", ".XXXX.", "", "OO.O"], "black");
    for (const l of steady) expect(["3,0", "3,5"]).toContain(key(chooseMove(s, l, seeded(1))));
  });

  it("따내기로 이길 수 있으면 따낸다 (흑 10개 → 12개)", () => {
    const s = fromDiagram(["", "", "", "....XOO.", "", "", "", "", "", "", "..........OO"], "black", { capturedByBlack: 10 });
    for (const l of steady) expect(key(chooseMove(s, l, seeded(2)))).toBe("3,7");
  });

  it("6목은 승리가 아니라는 것을 안다 — 정확히 5목이 되는 자리를 고른다", () => {
    // 흑 (3,0..3)과 (3,5): (3,4)는 6목(승리 아님), 다른 줄의 정확한 5목 자리를 찾아야 함
    const s = fromDiagram(["", "", "", "XXXX.X", "", "", "", "........X", "........X", "........X", "........X"], "black");
    const m = chooseMove(s, strongest, seeded(3));
    const r = tryMove(s, m);
    expect(r.ok && r.state.winner).toBe("black");
    expect(key(m)).not.toBe("3,4");
  });

  it("상대의 넉 점을 막는다 (한쪽이 막힌 넉 점)", () => {
    const s = fromDiagram(["", "", "", "", "XOOOO", "", "", "..X.X", "...X"], "black");
    for (const l of steady) expect(key(chooseMove(s, l, seeded(4)))).toBe("4,5");
  });

  it("띈 석 점(●·●●)을 막는다 — 실제로 놓쳤던 장면의 회귀 테스트", () => {
    const seq = "7,7 5,5 5,9 6,8 7,9 6,9 7,8 7,10 6,7 6,10 4,7 6,11 6,12".split(" ").map((x) => {
      const [row, col] = x.split(",").map(Number);
      return { row, col };
    });
    let s: GameState = createGame(15);
    for (const m of seq) s = (tryMove(s, m) as { state: GameState }).state;
    // 매 수 집중하는 단계(focus 1, 깊이 2 이상)는 반드시 막는다. 7급(focus 0.5)은 설계상 가끔 놓친다.
    const focused = AI_LEVELS.filter((l) => l.focus === 1 && l.depth >= 2);
    expect(focused.map((l) => l.label)).toEqual(["10급", "3급"]);
    for (const l of focused) expect(["3,7", "5,7", "8,7"]).toContain(key(chooseMove(s, l, seeded(5))));
  });

  it("어느 단계든 끝까지 규칙에 맞는 수만 둔다", () => {
    const rand = seeded(6);
    for (const [b, w] of [[0, 3], [2, 1], [4, 0]]) {
      let s = createGame(15);
      while (!s.isFinished && s.moveCount < 120) {
        const m = chooseMove(s, AI_LEVELS[s.currentPlayer === "black" ? b : w], rand);
        const r = tryMove(s, m);
        expect(r.ok).toBe(true);
        if (!r.ok) break;
        s = r.state;
      }
    }
  });

  it("원본 상태를 바꾸지 않는다", () => {
    const s = fromDiagram(["", "", "...XOO.", "...X"], "white");
    const snap = JSON.stringify(s);
    chooseMove(s, strongest, seeded(7));
    expect(JSON.stringify(s)).toBe(snap);
  });

  it("가장 센 단계도 중반 한 수를 2초 안에 둔다", () => {
    let s = createGame(15);
    const rand = seeded(8);
    for (let i = 0; i < 16 && !s.isFinished; i++) s = (tryMove(s, chooseMove(s, AI_LEVELS[3], rand)) as { state: GameState }).state;
    if (s.isFinished) return;
    const t = performance.now();
    chooseMove(s, strongest, rand);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});
