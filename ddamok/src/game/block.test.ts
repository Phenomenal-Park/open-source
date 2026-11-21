import { describe, expect, it } from "vitest";
import { blockedCell, canScan, createGame, hiddenTurnsLeft, replayMoves, scanAt, tryMove, type GameState, type Position } from "./index.ts";
import { FastBoard, WALL } from "../ai/fast.ts";
import { at } from "./testUtils.ts";

// (실험) 흑 ⓧ: 스캔 대신 한 판에 한 번, 빈 교차점 하나를 양쪽 모두 못 두게 막는다(차례 그대로)
const on = () => createGame(15, { hiddenMove: true, blackBlock: true, captureTarget: { black: 10, white: 10 } });
function seq(state: GameState, ...moves: (Position | { hidden: Position })[]): GameState {
  for (const m of moves) {
    const r = "hidden" in m ? tryMove(state, m.hidden, undefined, { hidden: true }) : tryMove(state, m);
    if (!r.ok) throw new Error(`illegal ${JSON.stringify(m)}: ${r.reason}`);
    state = r.state;
  }
  return state;
}

describe("흑 ⓧ (실험)", () => {
  it("백 히든 전에도 쓸 수 있고, 차례는 그대로이며, 그 자리는 아무도 못 둔다", () => {
    const s = seq(on(), at(7, 7), at(7, 8));
    expect(canScan(s)).toBe(true);
    const r = scanAt(s, at(7, 9));
    if (!r.ok) throw new Error(r.reason);
    expect(r.hit).toBe(false);
    expect(r.state.currentPlayer).toBe("black");
    expect(blockedCell(r.state)).toEqual(at(7, 9));
    expect(canScan(r.state)).toBe(false);
    expect(tryMove(r.state, at(7, 9))).toEqual({ ok: false, reason: "occupied" });
    const w = seq(r.state, at(6, 6));
    expect(tryMove(w, at(7, 9), undefined, { hidden: true })).toEqual({ ok: false, reason: "occupied" });
  });

  it("백의 숨은 돌 자리면 돌이 드러나고 ⓧ는 남지 않는다(흑이 이어서 둔다)", () => {
    const s = seq(on(), at(7, 7), { hidden: at(3, 3) });
    const r = scanAt(s, at(3, 3));
    if (!r.ok) throw new Error(r.reason);
    expect(r.hit).toBe(true);
    expect(r.state.hidden?.revealed).toBe(true);
    expect(r.state.board[3][3]).toBe("white");
    expect(blockedCell(r.state)).toBeNull();
    expect(r.state.currentPlayer).toBe("black");
    expect(canScan(r.state)).toBe(false);
  });

  it("ⓧ는 줄을 끊는다: 그 자리를 지나는 오목은 없다", () => {
    let s = seq(on(), at(7, 7), at(0, 0));
    const r = scanAt(s, at(7, 9));
    if (!r.ok) throw new Error(r.reason);
    s = seq(r.state, at(7, 8), at(0, 2), at(7, 10), at(0, 4), at(7, 11), at(0, 6));
    s = seq(s, at(7, 6));
    expect(s.isFinished).toBe(false); // 7,6 7,7 7,8 [ⓧ] 7,10 7,11
    const b = FastBoard.fromState(s);
    expect(b.cells[7 * 15 + 9]).toBe(WALL);
    expect(b.candidates()).not.toContain(7 * 15 + 9);
  });

  it("이 설정에서는 숨긴 뒤 5수 공개가 없고, 기보 재생으로 ⓧ가 되살아난다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(3, 3) }, at(8, 8), at(9, 9), at(8, 7), at(9, 7), at(8, 6), at(9, 6), at(2, 2), at(9, 5), at(1, 1), at(10, 10));
    expect(s.hidden?.revealed).toBe(false);
    expect(hiddenTurnsLeft(s)).toBeNull();
    const r = scanAt(s, at(12, 12));
    if (!r.ok) throw new Error(r.reason);
    const rep = replayMoves(s.config, s.moves, 1, { at: s.moves.length, pos: at(12, 12) });
    expect(rep.ok && blockedCell(rep.state)).toEqual(at(12, 12));
  });
});
