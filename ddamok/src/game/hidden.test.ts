import { describe, expect, it } from "vitest";
import { canUseHidden, createGame, forfeitHidden, replayMoves, tryMove, viewFor, type GameState, type Position } from "./index.ts";
import { at } from "./testUtils.ts";

const on = () => createGame(15, { hiddenMove: true });
/** 수를 차례로 둔다. 숨길 수는 { hidden: pos } 로 적는다 */
function seq(state: GameState, ...moves: (Position | { hidden: Position })[]): GameState {
  for (const m of moves) {
    const r = "hidden" in m ? tryMove(state, m.hidden, undefined, { hidden: true }) : tryMove(state, m);
    if (!r.ok) throw new Error(`illegal ${JSON.stringify(m)}: ${r.reason}`);
    state = r.state;
  }
  return state;
}

describe("백 히든", () => {
  it("기본은 꺼져 있다", () => {
    const s = seq(createGame(15), at(7, 7));
    expect(canUseHidden(s)).toBe(false);
    expect(tryMove(s, at(7, 8), undefined, { hidden: true })).toEqual({ ok: false, reason: "hidden-unavailable" });
  });

  it("백만, 한 판에 한 번", () => {
    expect(tryMove(on(), at(7, 7), undefined, { hidden: true })).toEqual({ ok: false, reason: "hidden-unavailable" });
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) }, at(3, 3));
    expect(canUseHidden(s)).toBe(false);
    expect(tryMove(s, at(9, 9), undefined, { hidden: true })).toEqual({ ok: false, reason: "hidden-unavailable" });
  });

  it("흑에게는 빈칸으로 보이고, 기보 좌표도 가려진다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) });
    expect(s.board[7][8]).toBe("white");
    expect(s.hidden).toEqual({ index: 1, pos: at(7, 8), revealed: false });
    expect(s.currentPlayer).toBe("black");
    const v = viewFor(s, "black");
    expect(v.board[7][8]).toBeNull();
    expect(v.moves[1]).toEqual({ row: -1, col: -1 });
    expect(v.lastMove).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"row":7,"col":8');
    expect(viewFor(s, "white")).toBe(s);
  });

  it("흑이 그 자리를 누르면 드러나고 흑 차례가 이어진다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) });
    const r = tryMove(s, at(7, 8));
    expect(r.ok && r.revealedHidden).toBe(true);
    if (!r.ok) return;
    expect(r.state.hidden?.revealed).toBe(true);
    expect(r.state.currentPlayer).toBe("black");
    expect(r.state.moveCount).toBe(2);
    expect(viewFor(r.state, "black").board[7][8]).toBe("white");
    // 드러난 뒤에는 평범한 돌: 다시 누르면 둘 수 없음, 다른 곳에는 둔다
    expect(tryMove(r.state, at(7, 8))).toEqual({ ok: false, reason: "occupied" });
    expect(tryMove(r.state, at(6, 6)).ok).toBe(true);
  });

  it("숨은 돌도 5목에 쓰이고, 대국이 끝나면 드러난다", () => {
    // 숨은 돌(3,3)과 띄어서 3,5~3,7 — 붙은 3이 아니라 아직 숨어 있다. 3,4로 이으면 5목.
    const s = seq(on(), at(7, 7), { hidden: at(3, 3) }, at(0, 14), at(3, 5), at(1, 14), at(3, 6), at(14, 0), at(3, 7), at(14, 2));
    expect(s.hidden?.revealed).toBe(false);
    const end = seq(s, at(3, 4));
    expect(end.winner).toBe("white");
    expect(end.winReason).toBe("five");
    expect(end.hidden?.revealed).toBe(true);
  });

  it("백이 숨은 돌을 받침으로 흑 두 점을 따내면 드러난다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 11) }, at(7, 9), at(0, 0), at(7, 10), at(7, 8));
    expect(s.lastCaptured).toEqual([at(7, 9), at(7, 10)]);
    expect(s.capturedByWhite).toBe(2);
    expect(s.hidden?.revealed).toBe(true);
  });

  it("숨겨 두는 수로 바로 따내면 드러난다", () => {
    const s = seq(on(), at(7, 7), at(7, 9), at(7, 8), { hidden: at(7, 6) });
    expect(s.capturedByWhite).toBe(2);
    expect(s.hidden?.revealed).toBe(true);
  });

  it("흑이 모르고 숨은 돌을 따내면 사라지고 드러난 것으로 친다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) }, at(0, 0), at(7, 9), at(7, 10));
    expect(s.capturedByBlack).toBe(2);
    expect(s.board[7][8]).toBeNull();
    expect(s.hidden?.revealed).toBe(true);
  });

  it("따내기와 상관없는 백의 수에는 드러나지 않는다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) }, at(6, 6), at(5, 5));
    expect(s.hidden?.revealed).toBe(false);
  });

  it("기보 재생: 히든 순번을 주면 같은 판이 된다", () => {
    const s = seq(on(), at(7, 7), at(6, 6), at(8, 8), { hidden: at(2, 12) }, at(5, 5));
    const r = replayMoves(s.config, s.moves, 3);
    expect(r.ok && r.state.hidden).toEqual({ index: 3, pos: at(2, 12), revealed: false });
    expect(r.ok && r.state.board).toEqual(s.board);
  });

  it("시간 안에 못 두면 기회가 사라지고 백 차례는 그대로", () => {
    const s = forfeitHidden(seq(on(), at(7, 7)));
    expect(s.currentPlayer).toBe("white");
    expect(canUseHidden(s)).toBe(false);
    expect(tryMove(s, at(7, 8), undefined, { hidden: true })).toEqual({ ok: false, reason: "hidden-unavailable" });
    expect(tryMove(s, at(7, 8)).ok).toBe(true);
  });

  it("숨긴 뒤 백이 5수를 더 두면 드러난다(그 전까지 남은 수가 줄어든다)", async () => {
    const { hiddenTurnsLeft } = await import("./rules.ts");
    let s = seq(on(), at(7, 7), { hidden: at(3, 3) });
    expect(hiddenTurnsLeft(s)).toBe(5);
    const far: Position[] = [at(0, 0), at(14, 14), at(0, 2), at(14, 12), at(0, 4), at(14, 10), at(0, 6), at(14, 8), at(0, 8)];
    // 흑 0,0 · 백 14,14 → 백 1수
    s = seq(s, far[0], far[1]);
    expect(hiddenTurnsLeft(s)).toBe(4);
    s = seq(s, far[2], far[3], far[4], far[5], far[6], far[7]); // 백 4수째까지
    expect(hiddenTurnsLeft(s)).toBe(1);
    expect(s.hidden?.revealed).toBe(false);
    s = seq(s, far[8], at(12, 6)); // 백 5수째 → 드러남
    expect(s.hidden?.revealed).toBe(true);
    expect(hiddenTurnsLeft(s)).toBeNull();
  });
});

