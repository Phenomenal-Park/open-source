import { describe, expect, it } from "vitest";
import { canScan, createGame, forfeitHidden, replayMoves, scanAt, tryMove, type GameState, type Position } from "./index.ts";
import { at } from "./testUtils.ts";

const on = () => createGame(15, { hiddenMove: true });
function seq(state: GameState, ...moves: (Position | { hidden: Position })[]): GameState {
  for (const m of moves) {
    const r = "hidden" in m ? tryMove(state, m.hidden, undefined, { hidden: true }) : tryMove(state, m);
    if (!r.ok) throw new Error(`illegal ${JSON.stringify(m)}: ${r.reason}`);
    state = r.state;
  }
  return state;
}

describe("흑 스캔", () => {
  it("백이 히든을 쓰기 전에는 못 쓴다", () => {
    const s = seq(on(), at(7, 7), at(7, 8));
    expect(canScan(s)).toBe(false);
    expect(scanAt(s, at(3, 3))).toEqual({ ok: false, reason: "scan-unavailable" });
  });

  it("히든 규칙이 없거나, 백 차례거나, 히든 기회가 사라졌으면 못 쓴다", () => {
    expect(canScan(seq(createGame(15), at(7, 7), at(7, 8)))).toBe(false);
    const hid = seq(on(), at(7, 7), { hidden: at(7, 8) }, at(3, 3));
    expect(hid.currentPlayer).toBe("white");
    expect(canScan(hid)).toBe(false);
    const lost = forfeitHidden(seq(on(), at(7, 7)));
    expect(canScan(seq(lost, at(7, 8)))).toBe(false);
  });

  it("빗나가면 흑 차례 그대로, 기록만 남고 한 판에 한 번", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) });
    expect(canScan(s)).toBe(true);
    const r = scanAt(s, at(5, 5));
    if (!r.ok) throw new Error(r.reason);
    expect(r.hit).toBe(false);
    expect(r.state.currentPlayer).toBe("black");
    expect(r.state.moves.length).toBe(2);
    expect(r.state.scan).toEqual({ pos: at(5, 5), at: 2, hit: false });
    expect(r.state.hidden?.revealed).toBe(false);
    expect(canScan(r.state)).toBe(false);
    expect(scanAt(r.state, at(7, 8))).toEqual({ ok: false, reason: "scan-unavailable" });
    // 이어서 둔다(스캔한 빈자리에도 둘 수 있다)
    expect(tryMove(r.state, at(5, 5)).ok).toBe(true);
  });

  it("맞히면 숨은 돌이 드러나고 흑 차례 그대로", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) });
    const r = scanAt(s, at(7, 8));
    if (!r.ok) throw new Error(r.reason);
    expect(r.hit).toBe(true);
    expect(r.state.hidden?.revealed).toBe(true);
    expect(r.state.currentPlayer).toBe("black");
    expect(r.state.scan).toEqual({ pos: at(7, 8), at: 2, hit: true });
  });

  it("이미 드러났으면 못 쓰고, 보이는 돌 자리는 스캔할 수 없다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(7, 8) }, at(3, 3), at(9, 9));
    expect(scanAt(s, at(9, 9))).toEqual({ ok: false, reason: "occupied" });
    expect(scanAt(s, at(15, 0))).toEqual({ ok: false, reason: "out-of-bounds" });
    const bumped = tryMove(s, at(7, 8)); // 흑이 숨은 돌 자리를 눌러 드러남
    if (!bumped.ok) throw new Error(bumped.reason);
    expect(canScan(bumped.state)).toBe(false);
  });

  it("스캔 기록은 이후 수에도 남고, 기보 다시 두기로 재현된다", () => {
    let s = seq(on(), at(7, 7), { hidden: at(7, 8) }, at(3, 3), at(9, 9));
    const r = scanAt(s, at(7, 8));
    if (!r.ok) throw new Error(r.reason);
    s = seq(r.state, at(6, 6), at(10, 10));
    expect(s.scan).toEqual({ pos: at(7, 8), at: 4, hit: true });
    const re = replayMoves(s.config, s.moves, 1, { at: 4, pos: at(7, 8) });
    expect(re.ok && re.state.scan).toEqual(s.scan);
    expect(re.ok && re.state.hidden?.revealed).toBe(true);
    // 스캔하고 아직 두지 않은 때(서버가 대국 중에 다시 두어 보는 경우)
    const now = replayMoves(s.config, s.moves.slice(0, 4), 1, { at: 4, pos: at(7, 8) });
    expect(now.ok && now.state.scan).toEqual({ pos: at(7, 8), at: 4, hit: true });
    expect(now.ok && now.state.currentPlayer).toBe("black");
    // 스캔할 수 없는 때를 적은 기보는 거부한다
    expect(replayMoves(s.config, s.moves, 1, { at: 3, pos: at(7, 8) }).ok).toBe(false);
  });
});

import { hiddenBelief } from "../ai/hidden.ts";
import { viewFor } from "./index.ts";

describe("흑의 짐작과 스캔", () => {
  it("스캔이 빗나간 자리는 숨은 돌 후보에서 빠진다", () => {
    const s = seq(on(), at(7, 7), { hidden: at(9, 9) }, at(3, 3), at(8, 8));
    const before = hiddenBelief(viewFor(s, "black"), 225).map((x) => x.pos);
    expect(before).toContain(6 * 15 + 6);
    const r = scanAt(s, at(6, 6));
    if (!r.ok) throw new Error(r.reason);
    const after = hiddenBelief(viewFor(r.state, "black"), 225).map((x) => x.pos);
    expect(after).not.toContain(6 * 15 + 6);
  });
});
