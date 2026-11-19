import { describe, expect, it } from "vitest";
import { createGame, tryMove, type GameState } from "../game/index.ts";
import { FastBoard } from "./fast.ts";

function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

/** 두 엔진의 판·포획 수·차례·승패가 같은가 */
function same(fb: FastBoard, s: GameState) {
  const n = s.config.boardSize;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) expect(fb.stoneAt(r * n + c)).toBe(s.board[r][c]);
  expect(fb.caps[1]).toBe(s.capturedByBlack);
  expect(fb.caps[2]).toBe(s.capturedByWhite);
}

describe("AI 고속 판 = 규칙 엔진 (차등 테스트)", () => {
  it("무작위 대국 1000판에서 매 수 판·포획·승패·무승부가 같고, 되돌리기도 정확하다", () => {
    const rand = rng(42);
    let finished = 0, captures = 0, draws = 0;
    for (let g = 0; g < 1000; g++) {
      const size = g % 3 === 0 ? 5 : g % 3 === 1 ? 7 : 9; // 작은 판: 포획·5목·무승부가 자주 나온다
      let s = createGame(size);
      const fb = new FastBoard(size);
      const hashes: number[] = [fb.hash];
      const snaps: GameState[] = [s];
      while (!s.isFinished) {
        const empties: number[] = [];
        for (let p = 0; p < size * size; p++) if (!s.board[(p / size) | 0][p % size]) empties.push(p);
        // 포획이 잘 나오도록 가끔은 따낼 수 있는 자리를 고른다
        const cap = empties.filter((p) => fb.capturesAt(p, fb.toMove).length);
        const center = ((size / 2) | 0) * size + ((size / 2) | 0); // 첫 수는 천원
        const pos = s.moveCount === 0 ? center : cap.length && rand() < 0.5 ? cap[(rand() * cap.length) | 0] : empties[(rand() * empties.length) | 0];
        const r = tryMove(s, { row: (pos / size) | 0, col: pos % size });
        expect(r.ok).toBe(true);
        if (!r.ok) break;
        const res = fb.play(pos);
        s = r.state;
        captures += r.captured.length ? 1 : 0;
        same(fb, s);
        expect(res === 1).toBe(s.isFinished && s.winner !== null);
        expect(res === 2).toBe(s.winReason === "draw");
        hashes.push(fb.hash);
        snaps.push(s);
      }
      finished++;
      if (s.winReason === "draw") draws++;
      // 처음까지 되돌리면 매 단계 원래 상태·해시와 같다
      for (let i = snaps.length - 2; i >= 0; i--) {
        fb.undo();
        same(fb, snaps[i]);
        expect(fb.hash).toBe(hashes[i]);
      }
    }
    expect(finished).toBe(1000);
    expect(captures).toBeGreaterThan(300);
    expect(draws).toBeGreaterThan(0);
  }, 120_000);
});
