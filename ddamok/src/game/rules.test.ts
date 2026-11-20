import { describe, expect, it } from "vitest";
import {
  applyMove, checkCaptureVictory, checkFiveInRow, createGame, createHistory, currentState,
  getCapturedStones, isLegalMove, playMove, replayMoves, tryMove, undoMove,
} from "./index.ts";
import { at, fromDiagram, play, stoneCount } from "./testUtils.ts";

/** 첫 수 천원 규칙만 끈 판 — 포획·5목·무르기 등 다른 규칙을 판 가장자리에서 확인하는 테스트용 */
const free = (n = 15) => createGame(n, { firstMoveCenter: false });

describe("일반 포획", () => {
  it("1. 흑이 가로 방향으로 백돌 두 개를 포획한다", () => {
    const s = fromDiagram(["XOO."], "black");
    const n = applyMove(s, at(0, 3));
    expect(n.board[0]).toEqual(["black", null, null, "black", ...Array(11).fill(null)]);
    expect(n.capturedByBlack).toBe(2);
    expect(n.lastCaptured).toEqual([at(0, 2), at(0, 1)]);
    expect(n.currentPlayer).toBe("white");
  });

  it("1b. 착수점이 왼쪽 끝이어도(·○○●) 포획한다", () => {
    const n = applyMove(fromDiagram([".OOX"], "black"), at(0, 0));
    expect(n.capturedByBlack).toBe(2);
    expect(n.board[0][1]).toBeNull();
    expect(n.board[0][2]).toBeNull();
  });

  it("2. 백이 세로 방향으로 흑돌 두 개를 포획한다", () => {
    const s = fromDiagram([".", "X", "X", "O"], "white");
    const n = applyMove(s, at(0, 0));
    expect(n.board[1][0]).toBeNull();
    expect(n.board[2][0]).toBeNull();
    expect(n.capturedByWhite).toBe(2);
    expect(n.capturedByBlack).toBe(0);
  });

  it("3. 흑이 대각선(↘) 방향으로 백돌 두 개를 포획한다", () => {
    const s = fromDiagram(["X...", ".O..", "..O.", "...."], "black");
    const n = applyMove(s, at(3, 3));
    expect(n.board[1][1]).toBeNull();
    expect(n.board[2][2]).toBeNull();
    expect(n.capturedByBlack).toBe(2);
  });

  it("4. 반대 대각선(↙)에서도 포획한다", () => {
    const s = fromDiagram(["...X", "..O.", ".O..", "...."], "black");
    const n = applyMove(s, at(3, 0));
    expect(n.board[2][1]).toBeNull();
    expect(n.board[1][2]).toBeNull();
    expect(n.capturedByBlack).toBe(2);
  });

  it("5. 바둑판 경계를 넘어서는 포획 판정은 없다", () => {
    // 오른쪽 끝: 백 (0,13),(0,14). 흑 (0,12)에 두면 → 방향의 세 번째 칸은 판 밖이므로 포획 없음
    const s = fromDiagram(["............." + "OO"], "black");
    const n = applyMove(s, at(0, 12));
    expect(n.capturedByBlack).toBe(0);
    expect(stoneCount(n, "white")).toBe(2);
    // 판 밖 좌표를 직접 넘겨도 예외 없이 빈 결과
    expect(getCapturedStones(s.board, at(0, 14), "black")).toEqual([]);
    // 모서리에서 3칸 이상 떨어진 칸이 없으면 검사 자체를 건너뛴다
    const corner = fromDiagram(["OO", "OO"], "black", { size: 5 });
    expect(getCapturedStones(corner.board, at(2, 2), "black")).toEqual([]);
  });
});

describe("자충과 잘못된 포획 방지", () => {
  it("6. 백이 ●○·●의 빈칸에 두어 ●○○●를 만들어도 백돌은 제거되지 않는다", () => {
    const s = fromDiagram(["XO.X"], "white");
    const n = applyMove(s, at(0, 2));
    expect(n.board[0].slice(0, 4)).toEqual(["black", "white", "white", "black"]);
    expect(n.capturedByBlack).toBe(0);
    expect(n.capturedByWhite).toBe(0);
    expect(n.lastCaptured).toEqual([]);
  });

  it("7. 이후 흑이 무관한 지점에 두어도 기존 ●○○●의 백돌은 제거되지 않는다 (실제 수순)", () => {
    // 흑(0,0) 백(0,1) 흑(0,3) 백(0,2)=자충 → 흑이 엉뚱한 곳(10,10)
    let s = play(free(), at(0, 0), at(0, 1), at(0, 3), at(0, 2));
    expect(s.board[0].slice(0, 4)).toEqual(["black", "white", "white", "black"]);
    s = play(s, at(10, 10));
    expect(s.board[0].slice(0, 4)).toEqual(["black", "white", "white", "black"]);
    expect(s.capturedByBlack).toBe(0);
    // 백·흑이 몇 수를 더 둬도 소급 포획은 없다
    s = play(s, at(9, 9), at(5, 5));
    expect(s.board[0].slice(0, 4)).toEqual(["black", "white", "white", "black"]);
    expect(s.capturedByBlack).toBe(0);
  });

  it("7b. 기존 ●○○● 바로 옆에 흑을 둬도 그 백돌은 잡히지 않는다", () => {
    const s = fromDiagram(["XOOX."], "black");
    const n = applyMove(s, at(0, 4));
    expect(n.board[0].slice(0, 5)).toEqual(["black", "white", "white", "black", "black"]);
    expect(n.capturedByBlack).toBe(0);
  });

  it("8. 흑백이 반대여도 같다: 흑의 자충은 제거되지 않는다", () => {
    // 실제 수순: 백(0,0)… 흑이 스스로 (0,2)에 두어 ○●●○ 완성
    let s = play(free(), at(0, 1), at(0, 0), at(9, 9), at(0, 3), at(0, 2));
    expect(s.board[0].slice(0, 4)).toEqual(["white", "black", "black", "white"]);
    expect(s.capturedByWhite).toBe(0);
    s = play(s, at(8, 8)); // 백이 무관한 곳에 착수해도 그대로
    expect(s.board[0].slice(0, 4)).toEqual(["white", "black", "black", "white"]);
    expect(s.capturedByWhite).toBe(0);
    // 대조군: 백이 마지막 돌을 놓아 완성하면 정상 포획
    const real = play(free(), at(7, 3), at(7, 2), at(7, 4), at(7, 5));
    expect(real.capturedByWhite).toBe(2);
    expect(real.board[7][3]).toBeNull();
  });

  it("9. 두 돌이 양쪽에서 둘러싸여 있다는 이유만으로 점수가 늘지 않는다", () => {
    // 판에 ●○○● 모양이 여러 개 있지만 이번 착수점은 어느 것의 끝도 아니다
    const s = fromDiagram(["XOOX", "....", "XOOX", "....", "X..."], "black");
    const n = applyMove(s, at(4, 1));
    expect(n.capturedByBlack).toBe(0);
    expect(stoneCount(n, "white")).toBe(4);
    // 착수점과 맞닿아 있어도 P-○-○-● 배열이 아니면 아님(가운데 끼워 두기 ○●○ 등)
    const mid = fromDiagram(["XO.OX"], "black");
    expect(applyMove(mid, at(0, 2)).capturedByBlack).toBe(0);
    // 상대 돌이 하나 또는 셋이면 따내지 않는다
    expect(applyMove(fromDiagram(["XO."], "black"), at(0, 2)).capturedByBlack).toBe(0);
    expect(applyMove(fromDiagram(["XOOO."], "black"), at(0, 4)).capturedByBlack).toBe(0);
  });
});

describe("복수 포획", () => {
  it("10. 한 번에 두 방향에서 포획하면 네 개가 제거된다", () => {
    const s = fromDiagram([
      "X..",
      "O..",
      "O..",
      ".OOX",
    ], "black");
    const n = applyMove(s, at(3, 0));
    expect(n.capturedByBlack).toBe(4);
    expect(n.lastCaptured).toHaveLength(4);
    expect(stoneCount(n, "white")).toBe(0);
  });

  it("10b. 세 방향 동시 포획은 +6, 8방향 전부는 +16", () => {
    const three = fromDiagram([
      "X..X",
      "O.O.",
      "OO..",
      ".OOX",
    ], "black");
    expect(applyMove(three, at(3, 0)).capturedByBlack).toBe(6);

    // 가운데(3,3)를 중심으로 8방향 모두 ○○● 배열
    const star = fromDiagram([
      "X..X..X",
      ".O.O.O.",
      "..OOO..",
      "XOO.OOX",
      "..OOO..",
      ".O.O.O.",
      "X..X..X",
    ], "black");
    const n = applyMove(star, at(3, 3));
    expect(n.capturedByBlack).toBe(16);
    expect(new Set(n.lastCaptured.map((p) => `${p.row},${p.col}`)).size).toBe(16);
  });

  // 11. (지시서에서 삭제됨) — 중복 집계 방지는 getCapturedStones 내부에서 좌표 Set으로 처리한다.

  it("12. 포획된 돌이 제거된 빈 교차점에 다시 착수할 수 있다", () => {
    const n = applyMove(fromDiagram(["XOO."], "black"), at(0, 3)); // 이제 백 차례
    expect(isLegalMove(n, at(0, 1))).toBe(true);
    const m = applyMove(n, at(0, 1));
    expect(m.board[0][1]).toBe("white");
    expect(m.moveCount).toBe(n.moveCount + 1);
  });
});

describe("오목과 금수", () => {
  it("13. 흑이 5목을 완성하면 승리한다", () => {
    const s = fromDiagram(["XXXX."], "black");
    const n = applyMove(s, at(0, 4));
    expect(n.isFinished).toBe(true);
    expect(n.winner).toBe("black");
    expect(n.winReason).toBe("five");
    expect(n.winningLine).toHaveLength(5);
  });

  it("13b. 실제 수순으로 흑 5목 (세로)", () => {
    const n = play(free(), at(3, 7), at(3, 0), at(4, 7), at(5, 0), at(5, 7), at(7, 0), at(6, 7), at(9, 0), at(7, 7));
    expect(n.winner).toBe("black");
    expect(n.winReason).toBe("five");
  });

  it("14. 백이 5목을 완성하면 승리한다 (대각선)", () => {
    const s = fromDiagram(["O....", ".O...", "..O..", "...O.", "....."], "white");
    const n = applyMove(s, at(4, 4));
    expect(n.winner).toBe("white");
    expect(n.winReason).toBe("five");
  });

  it("15. 6목 이상은 둘 수 있으나 승리가 아니다 — 정확히 5목만 승리", () => {
    const six = fromDiagram(["XXX.XX"], "black");
    expect(isLegalMove(six, at(0, 3))).toBe(true);
    const n = applyMove(six, at(0, 3)); // 6목
    expect(n.board[0][3]).toBe("black");
    expect(n.isFinished).toBe(false);
    expect(n.winner).toBeNull();
    expect(n.currentPlayer).toBe("white");

    const seven = applyMove(fromDiagram(["XXX.XXX"], "black"), at(0, 3));
    expect(seven.isFinished).toBe(false);

    // 다른 축에서 정확히 5목이 함께 생기면 그 5목으로 승리
    const both = fromDiagram([
      "XXX.XX",
      "...X..",
      "...X..",
      "...X..",
      "...X..",
    ], "black");
    // (0,3): 가로는 6목, 세로는 (0..4,3) 정확히 5목
    const w = applyMove(both, at(0, 3));
    expect(w.winner).toBe("black");
    expect(w.winningLine?.every((p) => p.col === 3)).toBe(true);

    // 설정으로 장목 승리를 켤 수 있다(기본은 꺼짐)
    expect(applyMove(fromDiagram(["XXX.XX"], "black", { overlineWins: true }), at(0, 3)).winner).toBe("black");
    expect(checkFiveInRow(n.board, at(0, 3), "black")).toBe(false);
    expect(checkFiveInRow(n.board, at(0, 3), "black", true)).toBe(true);
  });

  it("16. 흑의 33·44 착수를 금지하지 않는다", () => {
    // 33: (4,4)에 두면 가로 열린 삼 + 세로 열린 삼
    const s33 = fromDiagram([
      "......",
      "......",
      "....X.",
      "....X.",
      "..XX..",
    ], "black");
    expect(isLegalMove(s33, at(4, 4))).toBe(true);
    const n33 = applyMove(s33, at(4, 4));
    expect(n33.board[4][4]).toBe("black");
    expect(n33.currentPlayer).toBe("white");
    // 44
    const s44 = fromDiagram([
      ".......",
      "....X..",
      "....X..",
      "....X..",
      ".XXX...",
    ], "black");
    const n44 = applyMove(s44, at(4, 4));
    expect(n44.board[4][4]).toBe("black");
    expect(n44.isFinished).toBe(false);
  });

  it("17. 돌을 따낸 뒤의 최종 판으로 5목을 판정한다", () => {
    // 흑 (3,3): ↖ 방향 (2,2)○ (1,1)○ (0,0)● → 포획, 동시에 가로 (3,0..4) 흑 5목
    const both = fromDiagram([
      "X....",
      ".O...",
      "..O..",
      "XXX.X",
    ], "black");
    const w = applyMove(both, at(3, 3));
    expect(w.board[1][1]).toBeNull();
    expect(w.board[2][2]).toBeNull();
    expect(w.capturedByBlack).toBe(2);
    expect(w.winner).toBe("black");
    expect(w.winReason).toBe("five");
    expect(w.winningLine).toHaveLength(5);

    // 포획으로 상대의 4목을 끊으면, 상대는 그 줄로 5목을 완성할 수 없다
    const cut = fromDiagram([
      "...X..",
      "OOOO..", // 백 4목
      "...O..",
    ], "black");
    // 흑 (3,3): ↑ 방향 (2,3)○ (1,3)○ (0,3)● → 백 (1,3),(2,3) 포획
    const afterCut = applyMove(cut, at(3, 3));
    expect(afterCut.board[1][3]).toBeNull();
    const whiteTry = applyMove(afterCut, at(1, 4));
    expect(whiteTry.board[1].slice(0, 5)).toEqual(["white", "white", "white", null, "white"]);
    expect(whiteTry.isFinished).toBe(false);
  });
});

describe("포획 승리", () => {
  it("18. 흑이 누적 12개를 따내면 승리한다", () => {
    const s = fromDiagram(["XOO."], "black", { capturedByBlack: 10 });
    const n = applyMove(s, at(0, 3));
    expect(n.capturedByBlack).toBe(12);
    expect(n.winner).toBe("black");
    expect(n.winReason).toBe("capture");
    expect(n.isFinished).toBe(true);
  });

  it("18b. 흑은 10개로는 승리하지 못한다(백과 비대칭)", () => {
    const n = applyMove(fromDiagram(["XOO."], "black", { capturedByBlack: 8 }), at(0, 3));
    expect(n.capturedByBlack).toBe(10);
    expect(n.isFinished).toBe(false);
    expect(checkCaptureVictory(n, "black")).toBe(false);
  });

  it("19. 백이 누적 10개를 따내면 승리한다", () => {
    const s = fromDiagram(["OXX."], "white", { capturedByWhite: 8 });
    const n = applyMove(s, at(0, 3));
    expect(n.capturedByWhite).toBe(10);
    expect(n.winner).toBe("white");
    expect(n.winReason).toBe("capture");
  });

  it("19b. 실제 수순으로 백이 다섯 번 따내 10개로 승리", () => {
    let s = free();
    // 매 라운드: 흑 a, 백 b(끝), 흑 c, 백 d(둘러쌀 돌 아님), ... 간단히 행마다 ○●●○ 만들기
    for (let k = 0; k < 5; k++) {
      const r = k * 2;
      // 흑(r,1) 백(r,0) 흑(r,2) 백(r,3) → 백이 (r,3)에 두어 (r,1),(r,2) 포획
      s = play(s, at(r, 1), at(r, 0), at(r, 2), at(r, 3));
      expect(s.capturedByWhite).toBe((k + 1) * 2);
    }
    expect(s.winner).toBe("white");
    expect(s.winReason).toBe("capture");
    expect(s.moveCount).toBe(20);
  });

  it("20. 한 번에 여러 개를 따내 기준을 넘겨도 승리한다", () => {
    const s = fromDiagram(["X..", "O..", "O..", ".OOX"], "black", { capturedByBlack: 10 });
    const n = applyMove(s, at(3, 0));
    expect(n.capturedByBlack).toBe(14);
    expect(n.winner).toBe("black");
    expect(n.winReason).toBe("capture");
  });

  it("21. 5목이 없고 포획 수가 기준 미만이면 대국은 계속된다", () => {
    const b = applyMove(fromDiagram(["XOO."], "black", { capturedByBlack: 8 }), at(0, 3));
    expect(b.isFinished).toBe(false);
    expect(b.winner).toBeNull();
    const w = applyMove(fromDiagram(["OXX."], "white", { capturedByWhite: 6 }), at(0, 3));
    expect(w.capturedByWhite).toBe(8);
    expect(w.isFinished).toBe(false);
  });

  it("21b. 포획 승리와 5목을 같은 수에 달성해도 정상 승리", () => {
    const s = fromDiagram(["X....", ".O...", "..O..", "XXX.X"], "black", { capturedByBlack: 10 });
    const n = applyMove(s, at(3, 3));
    expect(n.winner).toBe("black");
    expect(n.winReason).toBe("capture");
    expect(n.winningLine).toHaveLength(5);
  });
});

describe("상태 관리", () => {
  it("22. 같은 위치에 중복 착수하지 못한다 (상태 변경 없음)", () => {
    const s = play(createGame(15), at(7, 7));
    expect(isLegalMove(s, at(7, 7))).toBe(false);
    const r = tryMove(s, at(7, 7));
    expect(r).toEqual({ ok: false, reason: "occupied" });
    expect(applyMove(s, at(7, 7))).toBe(s);
    expect(applyMove(s, at(-1, 0))).toBe(s);
    expect(applyMove(s, at(0, 15))).toBe(s);
    expect(applyMove(s, at(0.5, 1))).toBe(s);
  });

  it("23. 흑이 먼저 두고 흑백 차례가 정확히 교대된다", () => {
    let s = free();
    expect(s.currentPlayer).toBe("black");
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(s.currentPlayer);
      s = applyMove(s, at(i, i));
      expect(s.board[i][i]).toBe(order[i]);
    }
    expect(order).toEqual(["black", "white", "black", "white", "black", "white"]);
    // 차례가 아닌 쪽의 착수는 거부(서버 검증용)
    expect(tryMove(s, at(10, 10), "white")).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("24. 포획이 발생한 수를 무르면 돌과 점수가 모두 복구된다", () => {
    let h = createHistory(free());
    for (const m of [at(0, 1), at(0, 0), at(0, 2)]) h = playMove(h, m); // 흑 백 흑
    const before = currentState(h);
    h = playMove(h, at(0, 3)); // 백이 흑 두 점 포획
    expect(currentState(h).capturedByWhite).toBe(2);
    expect(currentState(h).board[0][1]).toBeNull();

    h = undoMove(h);
    const restored = currentState(h);
    expect(restored).toEqual(before);
    expect(restored.board[0].slice(0, 4)).toEqual(["white", "black", "black", null]);
    expect(restored.capturedByWhite).toBe(0);
    expect(restored.currentPlayer).toBe("white");
    expect(restored.moveCount).toBe(3);
  });

  it("24b. 승리 수를 무르면 승패도 되돌아간다", () => {
    let h = createHistory(fromDiagram(["XXXX."], "black"));
    h = playMove(h, at(0, 4));
    expect(currentState(h).winner).toBe("black");
    h = undoMove(h);
    expect(currentState(h).winner).toBeNull();
    expect(currentState(h).isFinished).toBe(false);
    expect(currentState(h).currentPlayer).toBe("black");
    // 초기 상태에서 무르기는 아무 일도 없다
    const h0 = createHistory(createGame(15));
    expect(undoMove(h0)).toBe(h0);
  });

  it("25. 승리 이후 착수가 불가능하다", () => {
    const won = applyMove(fromDiagram(["XXXX."], "black"), at(0, 4));
    expect(won.isFinished).toBe(true);
    expect(isLegalMove(won, at(5, 5))).toBe(false);
    expect(tryMove(won, at(5, 5))).toEqual({ ok: false, reason: "finished" });
    expect(applyMove(won, at(5, 5))).toBe(won);
  });

  it("26. 대국을 초기화하면 돌·따낸 돌 수·수순이 모두 초기화된다", () => {
    const played = play(free(), at(0, 1), at(0, 0), at(0, 2), at(0, 3));
    expect(played.capturedByWhite).toBe(2);
    const fresh = createGame(played.config.boardSize);
    expect(stoneCount(fresh, "black") + stoneCount(fresh, "white")).toBe(0);
    expect(fresh.capturedByBlack).toBe(0);
    expect(fresh.capturedByWhite).toBe(0);
    expect(fresh.moveCount).toBe(0);
    expect(fresh.moves).toEqual([]);
    expect(fresh.lastMove).toBeNull();
    expect(fresh.currentPlayer).toBe("black");
    expect(fresh.winner).toBeNull();
  });
});

describe("첫 수는 천원", () => {
  it("흑의 첫 수는 천원(가운데)만 둘 수 있다", () => {
    const s = createGame(15);
    expect(isLegalMove(s, at(0, 0))).toBe(false);
    expect(tryMove(s, at(7, 8))).toEqual({ ok: false, reason: "first-move-center" });
    expect(applyMove(s, at(3, 3))).toBe(s);
    const n = applyMove(s, at(7, 7));
    expect(n.board[7][7]).toBe("black");
    // 두 번째 수부터는 어디든
    expect(isLegalMove(n, at(0, 0))).toBe(true);
  });

  it("판 크기가 달라도 가운데", () => {
    expect(applyMove(createGame(13), at(6, 6)).moveCount).toBe(1);
    expect(applyMove(createGame(19), at(9, 9)).moveCount).toBe(1);
    expect(applyMove(createGame(19), at(7, 7)).moveCount).toBe(0);
  });

  it("기보 재검증에서도 첫 수가 천원이 아니면 거부", () => {
    expect(replayMoves(createGame(15).config, [at(0, 0)])).toEqual({ ok: false, moveIndex: 0, reason: "first-move-center" });
    expect(replayMoves(createGame(15).config, [at(7, 7), at(0, 0)]).ok).toBe(true);
  });
});

describe("(실험용) 펜테식 제한: 흑의 두 번째 수는 천원에서 3칸 이상", () => {
  it("기본은 꺼져 있고, 켜면 흑 3수째가 천원 5×5 안이면 거부", () => {
    const off = play(createGame(15), at(7, 7), at(7, 8));
    expect(isLegalMove(off, at(6, 6))).toBe(true);
    const on = play(createGame(15, { secondMoveMinDistance: 3 }), at(7, 7), at(7, 8));
    expect(tryMove(on, at(6, 6))).toEqual({ ok: false, reason: "second-move-distance" });
    expect(isLegalMove(on, at(9, 9))).toBe(false);
    expect(isLegalMove(on, at(4, 7))).toBe(true);
    expect(isLegalMove(on, at(10, 12))).toBe(true);
    // 그 다음 수부터는 제한 없음
    const after = play(on, at(4, 7));
    expect(isLegalMove(after, at(6, 6))).toBe(true);
  });
});

describe("(실험용) 백만 장목 승리", () => {
  it("켜면 백의 6목은 승리, 흑의 6목은 여전히 승리가 아니다", () => {
    const w = applyMove(fromDiagram(["OOO.OO"], "white", { size: 15 }), at(0, 3));
    expect(w.isFinished).toBe(false); // 기본: 백도 6목은 승리 아님
    const on = fromDiagram(["OOO.OO", "", "XXX.XX"], "white");
    on.config = { ...on.config, whiteOverlineWins: true };
    expect(applyMove(on, at(0, 3)).winner).toBe("white");
    const onB = fromDiagram(["OOO.OO", "", "XXX.XX"], "black");
    onB.config = { ...onB.config, whiteOverlineWins: true };
    expect(applyMove(onB, at(2, 3)).isFinished).toBe(false);
  });
});

describe("무승부", () => {
  // 5×5 판, (4,4) 한 칸만 비어 있다. 흑이 두면 5목도 포획도 없이 판이 다 찬다.
  const full = () => fromDiagram(["XOXOX", "XOXOO", "OXOXO", "OXOXO", "XOXO."], "black", { size: 5 });

  it("판이 다 차고 승자가 없으면 무승부로 끝난다", () => {
    const n = applyMove(full(), at(4, 4));
    expect(n.isFinished).toBe(true);
    expect(n.winner).toBeNull();
    expect(n.winReason).toBe("draw");
    expect(isLegalMove(n, at(0, 0))).toBe(false);
  });

  it("마지막 수로 포획이 나서 빈칸이 생기면 계속 둔다", () => {
    // (4,4) 흑 → 위쪽 (3,4)○ (2,4)○ (1,4)● 포획
    const s = fromDiagram(["XOXOX", "XOXOX", "OXOXO", "OXOXO", "XOXO."], "black", { size: 5 });
    const n = applyMove(s, at(4, 4));
    expect(n.capturedByBlack).toBe(2);
    expect(n.isFinished).toBe(false);
    expect(n.currentPlayer).toBe("white");
  });

  it("마지막 칸에서 5목이 되면 무승부가 아니라 승리", () => {
    const s = fromDiagram(["OXOXO", "XOXOX", "OXOXO", "XOXOX", "XXXX."], "black", { size: 5 });
    const n = applyMove(s, at(4, 4));
    expect(n.winner).toBe("black");
    expect(n.winReason).toBe("five");
  });

  it("무승부를 무르면 다시 둘 수 있다", () => {
    let h = createHistory(full());
    h = playMove(h, at(4, 4));
    expect(currentState(h).winReason).toBe("draw");
    h = undoMove(h);
    expect(currentState(h).isFinished).toBe(false);
  });
});

describe("엔진 일반", () => {
  it("applyMove는 원본 상태를 수정하지 않는다", () => {
    const s = fromDiagram(["XOO."], "black");
    const snapshot = JSON.stringify(s);
    applyMove(s, at(0, 3));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("판 크기는 설정값이다", () => {
    expect(createGame(19).board).toHaveLength(19);
    expect(createGame().board).toHaveLength(15);
    expect(() => createGame(3)).toThrow();
    expect(() => createGame(15.5)).toThrow();
  });

  it("replayMoves로 기보를 재검증할 수 있다", () => {
    const moves = [at(0, 1), at(0, 0), at(0, 2), at(0, 3)];
    const r = replayMoves(free().config, moves);
    expect(r.ok && r.state.capturedByWhite).toBe(2);
    const bad = replayMoves(free().config, [at(0, 0), at(0, 0)]);
    expect(bad).toEqual({ ok: false, moveIndex: 1, reason: "occupied" });
    const afterEnd = replayMoves(free().config, [
      at(0, 0), at(1, 0), at(0, 1), at(1, 1), at(0, 2), at(1, 2), at(0, 3), at(1, 3), at(0, 4), at(5, 5),
    ]);
    expect(afterEnd).toEqual({ ok: false, moveIndex: 9, reason: "finished" });
  });
});
