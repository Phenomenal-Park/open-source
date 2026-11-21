import { describe, expect, it } from "vitest";
import { blockedCell, canScan, createGame, hiddenTurnsLeft, replayMoves, scanAt, tryMove, viewFor, type GameState, type Position } from "./index.ts";
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

describe("ⓧ를 아는 수읽기 (실험)", () => {
  it("흑에게 ⓧ가 남아 있으면 백은 열린 넷을 확실한 승리로 보지 않는다", async () => {
    const { FastSearcher, WIN } = await import("../ai/fastSearch.ts");
    // 백 6,4~6,6 열린 삼, 백 차례: 6,7(또는 6,3)이면 열린 넷
    const w = seq(on(), at(7, 7), at(6, 4), at(0, 0), at(6, 5), at(0, 2), at(6, 6), at(0, 4));
    expect(w.currentPlayer).toBe("white");
    const b1 = FastBoard.fromState(w);
    expect(b1.wallAvail).toBe(true);
    const withX = new FastSearcher(b1, 12).searchRoot(4, 300, false, true).scores[0].s;
    const b2 = FastBoard.fromState(w);
    b2.setWallAvail(false);
    const without = new FastSearcher(b2, 12).searchRoot(4, 300, false, true).scores[0].s;
    expect(without).toBeGreaterThanOrEqual(WIN / 2);
    expect(withX).toBeLessThan(WIN / 2);
  });
});

describe("초록돌 (실험, 중립)", () => {
  const green = () => createGame(15, { hiddenMove: true, blackBlock: true, greenStone: true, captureTarget: { black: 10, white: 10 } });

  it("흑이 초록돌을 받침으로 백 두 점을 따낸다(놓는 것만으로는 안 따낸다)", () => {
    // 백 5,5 5,6 — 흑이 5,7에 초록돌, 이어서 5,4에 두면 따낸다
    const s = seq(green(), at(7, 7), at(5, 5), at(0, 0), at(5, 6));
    const r = scanAt(s, at(5, 7));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.board[5][5]).toBe("white"); // 놓는 것만으로는 그대로
    const t = tryMove(r.state, at(5, 4));
    if (!t.ok) throw new Error(t.reason);
    expect(t.captured).toHaveLength(2);
    expect(t.state.capturedByBlack).toBe(2);
    const b = FastBoard.fromState(r.state);
    expect(b.capturesAt(5 * 15 + 4, 1)).toHaveLength(2);
  });

  it("백도 초록돌을 받침으로 흑 두 점을 따낸다", () => {
    const s4 = seq(green(), at(7, 7), at(0, 0));
    const r4 = scanAt(s4, at(9, 9));
    if (!r4.ok) throw new Error(r4.reason);
    const s5 = seq(r4.state, at(8, 8), at(0, 2), at(0, 4));
    const t2 = tryMove(s5, at(6, 6)); // 백 6,6 - 흑 7,7 8,8 - 초록 9,9
    if (!t2.ok) throw new Error(t2.reason);
    expect(t2.captured).toHaveLength(2);
    expect(t2.state.capturedByWhite).toBe(2);
  });
});

describe("매직스톤: 쓰면 턴이 넘어간다 (실험)", () => {
  const magic = () => createGame(15, { hiddenMove: true, blackBlock: true, greenStone: true, scanCostsMove: true, captureTarget: { black: 10, white: 10 } });

  it("놓으면 백 차례가 되고, 기보 재생도 같다", () => {
    const s = seq(magic(), at(7, 7), at(5, 5));
    const r = scanAt(s, at(5, 7));
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.currentPlayer).toBe("white");
    expect(blockedCell(r.state)).toEqual(at(5, 7));
    const s2 = seq(r.state, at(5, 6), at(5, 4)); // 백 5,5 5,6 — 흑 5,4 + 매직스톤 5,7 받침
    expect(s2.capturedByBlack).toBe(2);
    const rep = replayMoves(s2.config, s2.moves, null, { at: 2, pos: at(5, 7) });
    expect(rep.ok && rep.state.capturedByBlack).toBe(2);
  });

  it("숨은 돌 자리에 놓아도 턴이 넘어간다", () => {
    const s = seq(magic(), at(7, 7), { hidden: at(3, 3) });
    const r = scanAt(s, at(3, 3));
    if (!r.ok) throw new Error(r.reason);
    expect(r.hit).toBe(true);
    expect(r.state.hidden?.revealed).toBe(true);
    expect(r.state.currentPlayer).toBe("white");
  });
});

describe("매직스톤 랜덤 출현 (실험)", () => {
  const rm = (hidden = true) => createGame(15, { hiddenMove: hidden, randomMagic: true, captureTarget: { black: 10, white: 10 } });

  it("5수마다 나타날 차례이고, 9×9 안 빈칸에만, 양쪽 모두의 받침이 된다", async () => {
    const { magicDue, magicCandidates, placeMagic } = await import("./rules.ts");
    let s = seq(rm(), at(7, 7), at(5, 5), at(0, 0), at(5, 6));
    expect(magicDue(s)).toBe(false);
    s = seq(s, at(0, 2));
    expect(magicDue(s)).toBe(true);
    const cands = magicCandidates(s);
    expect(cands.every((p) => Math.abs(p.row - 7) <= 4 && Math.abs(p.col - 7) <= 4)).toBe(true);
    expect(cands).toContainEqual(at(5, 7));
    expect(cands).not.toContainEqual(at(5, 5));
    s = placeMagic(s, at(5, 7));
    expect(magicDue(s)).toBe(false);
    expect(s.currentPlayer).toBe("white");
    expect(tryMove(s, at(5, 7))).toEqual({ ok: false, reason: "occupied" });
    s = seq(s, at(1, 1));
    const t = tryMove(s, at(5, 4)); // 흑 5,4 - 백 5,5 5,6 - 매직 5,7
    if (!t.ok) throw new Error(t.reason);
    expect(t.captured).toHaveLength(2);
    expect(FastBoard.fromState(s).capturesAt(5 * 15 + 4, 1)).toHaveLength(2);
  });

  it("숨은 돌 자리에 나타나면 숨은 돌이 드러나고 매직스톤은 남지 않는다", async () => {
    const { placeMagic, blockedCells } = await import("./rules.ts");
    const s = seq(rm(), at(7, 7), { hidden: at(6, 6) });
    const m = placeMagic(s, at(6, 6));
    expect(m.hidden?.revealed).toBe(true);
    expect(blockedCells(m)).toEqual([]);
    expect(m.board[6][6]).toBe("white");
  });
});

describe("실드 + 랜덤 매직스톤 (실험)", () => {
  it("매직스톤만 따내기 받침이고 실드는 받침이 아니다", async () => {
    const { placeMagic } = await import("./rules.ts");
    let s = seq(createGame(15, { hiddenMove: true, blackBlock: true, randomMagic: true, noTimedReveal: true, captureTarget: { black: 10, white: 10 } }), at(7, 7), at(5, 5), at(0, 0), at(5, 6));
    const r = scanAt(s, at(5, 7)); // 실드
    if (!r.ok) throw new Error(r.reason);
    s = seq(r.state, at(0, 2), at(9, 5), at(14, 14), at(9, 6)); // 백 9,5 9,6
    s = placeMagic(s, at(9, 7));
    expect(tryMove(s, at(5, 4)).ok && (tryMove(s, at(5, 4)) as any).captured).toEqual([]); // 실드 받침 → 안 따임
    const t = tryMove(s, at(9, 4)); // 매직스톤 받침 → 따냄
    expect(t.ok && t.captured).toHaveLength(2);
    const b = FastBoard.fromState(s);
    expect(b.capturesAt(5 * 15 + 4, 1)).toEqual([]);
    expect(b.capturesAt(9 * 15 + 4, 1)).toHaveLength(2);
    expect(scanAt({ ...s, scan: null }, at(9, 7))).toEqual({ ok: false, reason: "occupied" });
  });
});

describe("백 히든 시작 때 (실험)", () => {
  it("whiteHiddenFrom 5면 백의 세 번째 수부터 숨길 수 있다", () => {
    const s = createGame(15, { hiddenMove: true, whiteHiddenFrom: 5 });
    const s1 = seq(s, at(7, 7));
    expect(tryMove(s1, at(7, 8), undefined, { hidden: true })).toEqual({ ok: false, reason: "hidden-unavailable" });
    const s5 = seq(s1, at(7, 8), at(8, 8), at(6, 6), at(9, 9));
    expect(s5.moveCount).toBe(5);
    expect(tryMove(s5, at(5, 5), undefined, { hidden: true }).ok).toBe(true);
  });
});

describe("백 지뢰 (실험)", () => {
  it("착수 대신 묻고(턴을 씀), 흑에게는 안 보이고, 흑이 밟으면 매직스톤이 되며 흑은 차례를 잃는다", async () => {
    const { placeMine, canPlaceMine, blockedCells } = await import("./rules.ts");
    let s = seq(createGame(15, { whiteMine: true, captureTarget: { black: 10, white: 10 } }), at(7, 7));
    expect(canPlaceMine(s)).toBe(true);
    const r = placeMine(s, at(7, 9));
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    expect(s.currentPlayer).toBe("black");
    expect(viewFor(s, "black").mine?.pos).toEqual({ row: -1, col: -1 });
    expect(viewFor(s, "white").mine?.pos).toEqual(at(7, 9));
    s = seq(s, at(7, 8));
    expect(tryMove(s, at(7, 9))).toEqual({ ok: false, reason: "occupied" }); // 백은 자기 지뢰 자리에 못 둔다
    s = seq(s, at(0, 0));
    const t = tryMove(s, at(7, 9)); // 흑이 밟음
    if (!t.ok) throw new Error(t.reason);
    expect(t.state.currentPlayer).toBe("white");
    expect(t.state.board[7][9]).toBeNull();
    expect(blockedCells(t.state)).toEqual([at(7, 9)]);
    expect(t.state.mine?.triggered).toBe(true);
    expect(canPlaceMine(t.state)).toBe(false);
    expect(FastBoard.fromState(viewFor(s, "white")).cells[7 * 15 + 9]).toBe(WALL);
  });
});
