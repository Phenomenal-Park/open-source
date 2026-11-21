import type { GameState, IllegalReason, MoveResult, Player, Position } from "./types.ts";
import { centerOf, DIRECTIONS, inBounds, opponent, overlineWinsFor } from "./config.ts";
import { getCapturedStones } from "./captures.ts";
import { checkCaptureVictory, findFiveInRow } from "./victory.ts";

export function whyIllegal(state: GameState, position: Position, player: Player = state.currentPlayer): IllegalReason | null {
  if (state.isFinished) return "finished";                                   // 1. 종료 여부
  if (player !== state.currentPlayer) return "not-your-turn";                // 2. 차례
  const { row, col } = position;
  if (!Number.isInteger(row) || !Number.isInteger(col) || !inBounds(state.config.boardSize, row, col)) {
    return "out-of-bounds";                                                  // 3. 판 내부
  }
  if (state.board[row][col] !== null) return "occupied";                    // 4. 빈 교차점
  // 흑의 첫 수(빈 판의 첫 착수)는 천원만
  if (state.config.firstMoveCenter && state.moveCount === 0 && !state.board.some((r) => r.some((c) => c !== null))) {
    const c = centerOf(state.config.boardSize);
    if (row !== c.row || col !== c.col) return "first-move-center";
  }
  // (실험용, 기본 꺼짐) 흑의 두 번째 수는 천원에서 일정 거리 이상
  if (state.config.secondMoveMinDistance > 0 && state.moveCount === 2 && state.currentPlayer === "black") {
    const c = centerOf(state.config.boardSize);
    if (Math.max(Math.abs(row - c.row), Math.abs(col - c.col)) < state.config.secondMoveMinDistance) return "second-move-distance";
  }
  // (실험용, 기본 꺼짐) 흑의 두 번째 수는 천원을 지나는 줄(가로·세로, star면 대각선까지)에 둘 수 없다
  const ban = state.config.secondMoveLineBan;
  if (ban !== "none" && state.moveCount === 2 && state.currentPlayer === "black") {
    const c = centerOf(state.config.boardSize), dr = row - c.row, dc = col - c.col;
    if (dr === 0 || dc === 0 || (ban === "star" && Math.abs(dr) === Math.abs(dc))) return "second-move-line";
  }
  return null;
}

export function isLegalMove(state: GameState, position: Position, player: Player = state.currentPlayer): boolean {
  return whyIllegal(state, position, player) === null;
}

export interface MoveOptions {
  /** 백 히든: 이 돌을 숨겨서 둔다 */
  hidden?: boolean;
}

const samePos = (a: Position | null | undefined, b: Position | null | undefined) => !!a && !!b && a.row === b.row && a.col === b.col;

/** 백 히든을 지금 쓸 수 있는가 */
export function canUseHidden(state: GameState): boolean {
  return state.config.hiddenMove && !state.isFinished && state.currentPlayer === "white" && state.hidden === null;
}

/** 백이 히든을 누르고 제한 시간 안에 두지 못했다: 이 판의 히든 기회가 사라진다(백 차례 그대로) */
export function forfeitHidden(state: GameState): GameState {
  if (!canUseHidden(state)) return state;
  return { ...state, hidden: { index: -1, pos: { row: -1, col: -1 }, revealed: true } };
}

/** 흑 스캔을 지금 쓸 수 있는가: 백이 히든을 썼고, 아직 드러나지 않았고, 흑 차례이고, 이 판에서 스캔을 안 썼을 때 */
export function canScan(state: GameState): boolean {
  const h = state.hidden;
  return state.config.hiddenMove && !state.isFinished && state.currentPlayer === "black" && state.scan === null && !!h && h.index >= 0 && !h.revealed;
}

/**
 * 흑 스캔: 교차점 하나에 숨은 돌이 있는지 본다. 차례는 그대로(흑이 이어서 둔다).
 * 숨은 돌이 있으면 드러난다. 보이는 돌이 있는 자리는 스캔할 수 없다.
 */
export function scanAt(state: GameState, pos: Position): { ok: true; state: GameState; hit: boolean } | { ok: false; reason: IllegalReason } {
  if (!canScan(state)) return { ok: false, reason: "scan-unavailable" };
  const n = state.config.boardSize;
  if (!Number.isInteger(pos?.row) || !Number.isInteger(pos?.col) || pos.row < 0 || pos.col < 0 || pos.row >= n || pos.col >= n) return { ok: false, reason: "out-of-bounds" };
  const h = state.hidden!;
  const hit = samePos(h.pos, pos);
  if (!hit && state.board[pos.row][pos.col] !== null) return { ok: false, reason: "occupied" };
  return {
    ok: true,
    hit,
    state: { ...state, scan: { pos: { row: pos.row, col: pos.col }, at: state.moves.length, hit }, hidden: hit ? { ...h, revealed: true } : h, lastCaptured: [] },
  };
}

/**
 * `viewer`에게 보이는 판. 아직 드러나지 않은 백 히든 돌은 백만 볼 수 있다(흑·관전자에게는 빈칸, 기보 좌표도 가린다).
 */
export function viewFor(state: GameState, viewer: Player | null): GameState {
  const h = state.hidden;
  if (!h || h.revealed || viewer === "white" || h.pos.row < 0) return state;
  const board = state.board.map((r) => r.slice());
  if (board[h.pos.row][h.pos.col] === "white") board[h.pos.row][h.pos.col] = null;
  const moves = state.moves.map((m, i) => (i === h.index ? { row: -1, col: -1 } : m));
  return { ...state, board, moves, lastMove: samePos(state.lastMove, h.pos) ? null : state.lastMove, hidden: { ...h, pos: { row: -1, col: -1 } } };
}

/**
 * 착수 한 번을 처리한다(지시서 §6 순서). 원본 state는 수정하지 않는다.
 * `player`를 넘기면 서버처럼 "누가 두려 하는지"까지 검증한다.
 * 흑이 아직 드러나지 않은 백 히든 돌 자리에 두려 하면, 돌이 드러나고 흑 차례가 그대로 이어진다(revealedHidden).
 */
export function tryMove(state: GameState, position: Position, player: Player = state.currentPlayer, opts: MoveOptions = {}): MoveResult {
  const h = state.hidden;
  if (!opts.hidden && h && !h.revealed && !state.isFinished && player === state.currentPlayer && player === "black" && samePos(h.pos, position)) {
    return { ok: true, state: { ...state, hidden: { ...h, revealed: true }, lastCaptured: [] }, captured: [], revealedHidden: true };
  }
  const reason = whyIllegal(state, position, player);
  if (reason) return { ok: false, reason };
  if (opts.hidden && !canUseHidden(state)) return { ok: false, reason: "hidden-unavailable" };

  const me = state.currentPlayer;
  const pos = { row: position.row, col: position.col };

  // 5. 착수
  const board = state.board.map((r) => r.slice());
  board[pos.row][pos.col] = me;

  // 6–7. 이번 착수점 기준 8방향 포획 대상 수집
  const immune = state.config.whiteFirstStoneImmune && state.moves.length >= 2 ? state.moves[1] : null;
  const captured = getCapturedStones(board, pos, me, immune);

  // 8. 동시에 제거
  for (const { row, col } of captured) board[row][col] = null;

  // 9. 누적 포획 수 갱신
  const capturedByBlack = state.capturedByBlack + (me === "black" ? captured.length : 0);
  const capturedByWhite = state.capturedByWhite + (me === "white" ? captured.length : 0);

  const next: GameState = {
    config: state.config,
    board,
    currentPlayer: me,
    capturedByBlack,
    capturedByWhite,
    moveCount: state.moveCount + 1,
    lastMove: pos,
    lastCaptured: captured,
    moves: [...state.moves, pos],
    scan: state.scan ?? null,
    hidden: opts.hidden ? { index: state.moves.length, pos, revealed: false } : state.hidden,
    winner: null,
    winReason: null,
    winningLine: null,
    isFinished: false,
  };

  // 백 히든 돌이 드러나는 경우: 숨은 돌을 두면서 따냈거나, 백이 숨은 돌을 받침으로 따냈거나, 흑이 숨은 돌을 따냈을 때
  const hs = next.hidden;
  if (hs && !hs.revealed && captured.length) {
    const anchored = me === "white" && DIRECTIONS.some(([dr, dc]) =>
      pos.row + 3 * dr === hs.pos.row && pos.col + 3 * dc === hs.pos.col
      && captured.some((c) => c.row === pos.row + dr && c.col === pos.col + dc));
    if (opts.hidden || anchored || captured.some((c) => samePos(c, hs.pos))) next.hidden = { ...hs, revealed: true };
  }

  // 10. 포획 승리
  const captureWin = checkCaptureVictory(next, me);
  // 11. 포획 후 최종 판에서 5목
  const line = findFiveInRow(board, pos, me, overlineWinsFor(state.config, me));

  if (captureWin || line) {
    // 12. 승리 → 종료. 같은 수에 둘 다 달성하면 처리 순서상 먼저 확인한 포획 승리로 기록하고 5목 줄도 남긴다.
    next.winner = me;
    next.winReason = captureWin ? "capture" : "five";
    next.winningLine = line;
    next.isFinished = true;
  } else if (!board.some((row) => row.includes(null))) {
    // 판이 다 찼고(포획으로 생긴 빈칸도 없음) 승자가 없으면 무승부
    next.winReason = "draw";
    next.isFinished = true;
  } else {
    // 13. 차례 넘김
    next.currentPlayer = opponent(me);
  }
  // 대국이 끝나면 숨은 돌도 드러난다
  if (next.isFinished && next.hidden && !next.hidden.revealed) next.hidden = { ...next.hidden, revealed: true };
  return { ok: true, state: next, captured };
}

/** 착수를 적용한 새 상태를 돌려준다. 둘 수 없는 곳이면 같은 state 객체를 그대로 돌려준다(상태 변경 없음). */
export function applyMove(state: GameState, position: Position, player?: Player): GameState {
  const result = tryMove(state, position, player);
  return result.ok ? result.state : state;
}

