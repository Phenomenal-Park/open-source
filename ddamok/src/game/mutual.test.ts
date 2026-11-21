import { describe, expect, it } from "vitest";
import { canScan, canUseHidden, createGame, scanAt, tryMove, viewFor, type GameState, type Position } from "./index.ts";
import { at } from "./testUtils.ts";

const mutual = () => createGame(15, { hiddenMove: true, mutualHidden: true, captureTarget: { black: 10, white: 10 } });
function seq(state: GameState, ...moves: (Position | { hidden: Position })[]): GameState {
  for (const m of moves) {
    const r = "hidden" in m ? tryMove(state, m.hidden, undefined, { hidden: true }) : tryMove(state, m);
    if (!r.ok) throw new Error(`illegal ${JSON.stringify(m)}: ${r.reason}`);
    state = r.state;
  }
  return state;
}

describe("(실험) 양쪽 히든", () => {
  it("흑 히든은 흑의 세 번째 수부터, 한 번", () => {
    let s = seq(mutual(), at(7, 7), at(7, 8));
    expect(canUseHidden(s)).toBe(false); // 흑 두 번째 수
    s = seq(s, at(6, 6), at(8, 8));
    expect(canUseHidden(s)).toBe(true); // 흑 세 번째 수
    s = seq(s, { hidden: at(3, 3) });
    expect(s.hiddenB).toEqual({ index: 4, pos: at(3, 3), revealed: false });
    expect(s.currentPlayer).toBe("white");
    expect(canUseHidden(s)).toBe(true); // 백은 아직 안 씀
    expect(canUseHidden(seq(s, at(9, 9)))).toBe(false); // 흑은 이미 씀
  });

  it("흑의 숨은 돌은 백에게 안 보이고, 백이 누르면 드러나며 백 차례 그대로", () => {
    const s = seq(mutual(), at(7, 7), at(7, 8), at(6, 6), at(8, 8), { hidden: at(3, 3) });
    expect(viewFor(s, "white").board[3][3]).toBeNull();
    expect(viewFor(s, "black").board[3][3]).toBe("black");
    const r = tryMove(s, at(3, 3));
    if (!r.ok) throw new Error(r.reason);
    expect(r.revealedHidden).toBe(true);
    expect(r.state.hiddenB?.revealed).toBe(true);
    expect(r.state.currentPlayer).toBe("white");
  });

  it("백 스캔: 흑이 숨긴 뒤 백 차례에 한 번", () => {
    const s = seq(mutual(), at(7, 7), at(7, 8), at(6, 6), at(8, 8), { hidden: at(3, 3) });
    expect(canScan(s)).toBe(true);
    const r = scanAt(s, at(3, 3));
    if (!r.ok) throw new Error(r.reason);
    expect(r.hit).toBe(true);
    expect(r.state.scanW).toEqual({ pos: at(3, 3), at: 5, hit: true });
    expect(canScan(r.state)).toBe(false);
  });

  it("기본 규칙(양쪽 히든 꺼짐)에서는 흑이 히든을 못 쓴다", () => {
    const s = seq(createGame(15, { hiddenMove: true }), at(7, 7), at(7, 8), at(6, 6), at(8, 8));
    expect(canUseHidden(s)).toBe(false);
  });

  it("상대의 숨은 돌 자리에 숨기려 해도 그 돌이 드러나고 차례는 그대로", () => {
    const s = seq(mutual(), at(7, 7), { hidden: at(6, 8) }, at(6, 6), at(8, 8));
    const r = tryMove(s, at(6, 8), undefined, { hidden: true });
    if (!r.ok) throw new Error(r.reason);
    expect(r.revealedHidden).toBe(true);
    expect(r.state.hidden?.revealed).toBe(true);
    expect(r.state.hiddenB ?? null).toBeNull(); // 흑의 히든 기회는 남아 있다
    expect(r.state.currentPlayer).toBe("black");
  });
});

