import type { GameState, IllegalReason, MoveResult, Player, Position } from "./types.ts";
import { centerOf, DIRECTIONS, inBounds, opponent, overlineWinsFor } from "./config.ts";
import { getCapturedStones } from "./captures.ts";
import { checkCaptureVictory, findFiveInRow } from "./victory.ts";

const samePos = (a: Position | null | undefined, b: Position | null | undefined) => !!a && !!b && a.row === b.row && a.col === b.col;

/** (실험) 흑 ⓧ 규칙에서 막힌 자리(없으면 null) */
export function blockedCell(state: GameState): Position | null {
  const s = state.scan;
  return state.config.blackBlock && s && !s.hit ? s.pos : null;
}

/** (실험) 아무도 둘 수 없는 중립 칸 전부: 흑 ⓧ/매직스톤 + 랜덤 매직스톤 */
export function blockedCells(state: GameState): Position[] {
  const out: Position[] = [];
  const b = blockedCell(state);
  if (b) out.push(b);
  for (const m of state.magic ?? []) if (!m.hit) out.push(m.pos);
  return out;
}

/** 이 중립 칸들이 따내기 받침이 되는가 */
function anchorCells(state: GameState): Position[] {
  const out: Position[] = [];
  const b = blockedCell(state);
  if (b && state.config.greenStone) out.push(b);
  for (const m of state.magic ?? []) if (!m.hit) out.push(m.pos);
  return out;
}

/** 랜덤 매직스톤이 나타날 차례인가(5수마다, 아직 이번 몫이 안 나왔을 때) */
export const MAGIC_EVERY = 5;
export function magicDue(state: GameState): boolean {
  if (!state.config.randomMagic || state.isFinished || state.moves.length === 0 || state.moves.length % MAGIC_EVERY !== 0) return false;
  return !(state.magic ?? []).some((m) => m.at === state.moves.length);
}

/** 매직스톤이 나타날 수 있는 자리: 천원 중심 9×9 안, 보이는 판에서 빈 교차점(숨은 돌 자리도 빈칸으로 보인다) */
export function magicCandidates(state: GameState): Position[] {
  const v = viewFor(state, null);
  const c = centerOf(state.config.boardSize), out: Position[] = [];
  const blocked = blockedCells(state);
  for (let r = c.row - 4; r <= c.row + 4; r++) for (let cc = c.col - 4; cc <= c.col + 4; cc++) {
    if (!inBounds(state.config.boardSize, r, cc) || v.board[r][cc] !== null) continue;
    if (blocked.some((b) => b.row === r && b.col === cc)) continue;
    out.push({ row: r, col: cc });
  }
  return out;
}

/** (실험) 백이 지금 지뢰를 묻을 수 있는가 */
export function canPlaceMine(state: GameState): boolean {
  return !!state.config.whiteMine && !state.isFinished && state.currentPlayer === "white" && !state.mine;
}

/** (실험) 백 지뢰 묻기: 착수 대신(턴을 씀). 빈 교차점에만 */
export function placeMine(state: GameState, pos: Position): { ok: true; state: GameState } | { ok: false; reason: IllegalReason } {
  if (!canPlaceMine(state)) return { ok: false, reason: "not-your-turn" };
  const reason = whyIllegal(state, pos, "white");
  if (reason) return { ok: false, reason };
  const h = state.hidden;
  if (h && !h.revealed && samePos(h.pos, pos)) return { ok: false, reason: "occupied" };
  return { ok: true, state: { ...state, mine: { pos: { row: pos.row, col: pos.col }, at: state.moves.length, triggered: false }, currentPlayer: "black", lastCaptured: [] } };
}

/** 기보 다시 두기용: source에 기록된 매직스톤 중 지금(target까지 둔 수)에 나타난 것을 target에 그대로 붙인다 */
export function replayMagic(target: GameState, source: GameState): GameState {
  const add = (source.magic ?? []).filter((m) => m.at === target.moves.length && !(target.magic ?? []).some((x) => x.at === m.at));
  return add.length ? { ...target, magic: [...(target.magic ?? []), ...add] } : target;
}

/** 매직스톤을 pos에 나타나게 한다(차례는 그대로). 백의 숨은 돌 자리면 숨은 돌이 드러나고 매직스톤은 남지 않는다 */
export function placeMagic(state: GameState, pos: Position): GameState {
  const h = state.hidden;
  const hit = !!h && h.index >= 0 && !h.revealed && samePos(h.pos, pos);
  const rec = { pos: { row: pos.row, col: pos.col }, at: state.moves.length, hit };
  return { ...state, magic: [...(state.magic ?? []), rec], hidden: hit ? { ...h!, revealed: true } : state.hidden };
}

export function whyIllegal(state: GameState, position: Position, player: Player = state.currentPlayer): IllegalReason | null {
  if (state.isFinished) return "finished";                                   // 1. 종료 여부
  if (player !== state.currentPlayer) return "not-your-turn";                // 2. 차례
  const { row, col } = position;
  if (!Number.isInteger(row) || !Number.isInteger(col) || !inBounds(state.config.boardSize, row, col)) {
    return "out-of-bounds";                                                  // 3. 판 내부
  }
  if (state.board[row][col] !== null) return "occupied";                    // 4. 빈 교차점
  if (blockedCells(state).some((b) => samePos(b, position))) return "occupied"; // (실험) ⓧ·매직스톤 자리
  if (player === "white" && state.mine && !state.mine.triggered && samePos(state.mine.pos, position)) return "occupied"; // (실험) 자기 지뢰 자리
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


/** 흑이 히든을 쓸 수 있는 가장 이른 때(그때까지 둔 수의 개수): 흑의 세 번째 수 */
export const BLACK_HIDDEN_FROM = 4;

/** 지금 차례인 쪽이 히든을 쓸 수 있는가(보통은 백만, 양쪽 히든이면 흑도 세 번째 수부터) */
export function canUseHidden(state: GameState): boolean {
  if (!state.config.hiddenMove || state.isFinished) return false;
  if (state.currentPlayer === "white") return state.hidden === null && state.moveCount >= (state.config.whiteHiddenFrom ?? 0);
  return !!state.config.mutualHidden && (state.hiddenB ?? null) === null && state.moveCount >= BLACK_HIDDEN_FROM;
}

/** 백이 히든을 누르고 제한 시간 안에 두지 못했다: 이 판의 히든 기회가 사라진다(백 차례 그대로) */
export function forfeitHidden(state: GameState): GameState {
  if (!canUseHidden(state)) return state;
  const gone = { index: -1, pos: { row: -1, col: -1 }, revealed: true };
  return state.currentPlayer === "white" ? { ...state, hidden: gone } : { ...state, hiddenB: gone };
}

/** 숨긴 뒤 백이 이만큼 더 두면 숨은 돌이 드러난다 */
export const HIDDEN_TURNS = 5;

/** 숨은 돌이 드러나기까지 남은 백의 수(숨기지 않았거나 이미 드러났으면 null) */
export function hiddenTurnsLeft(state: GameState): number | null {
  const h = state.hidden;
  if (!h || h.revealed || h.index < 0 || state.config.mutualHidden || state.config.blackBlock || state.config.noTimedReveal) return null;
  const whiteMovesSince = Math.floor((state.moves.length - 1 - h.index) / 2);
  return Math.max(0, HIDDEN_TURNS - whiteMovesSince);
}

/** 흑 스캔을 지금 쓸 수 있는가: 백이 히든을 썼고, 아직 드러나지 않았고, 흑 차례이고, 이 판에서 스캔을 안 썼을 때 */
export function canScan(state: GameState): boolean {
  if (state.isFinished) return false;
  if (state.config.whiteMine && state.currentPlayer === "black") return !!state.config.mineScan && state.scan === null && !!state.mine && !state.mine.triggered; // (실험, 기본 꺼짐) 지뢰를 묻은 뒤 한 번
  if (!state.config.hiddenMove) return false;
  if (state.currentPlayer === "black") {
    const h = state.hidden;
    if (state.config.blackBlock) return state.scan === null; // ⓧ는 언제든 한 번
    return state.scan === null && !!h && h.index >= 0 && !h.revealed;
  }
  const hb = state.hiddenB;
  return !!state.config.mutualHidden && (state.scanW ?? null) === null && !!hb && hb.index >= 0 && !hb.revealed;
}

/**
 * 흑 스캔: 교차점 하나에 숨은 돌이 있는지 본다. 차례는 그대로(흑이 이어서 둔다).
 * 숨은 돌이 있으면 드러난다. 보이는 돌이 있는 자리는 스캔할 수 없다.
 */
export function scanAt(state: GameState, pos: Position): { ok: true; state: GameState; hit: boolean } | { ok: false; reason: IllegalReason } {
  if (!canScan(state)) return { ok: false, reason: "scan-unavailable" };
  const n = state.config.boardSize;
  if (!Number.isInteger(pos?.row) || !Number.isInteger(pos?.col) || pos.row < 0 || pos.col < 0 || pos.row >= n || pos.col >= n) return { ok: false, reason: "out-of-bounds" };
  const byBlack = state.currentPlayer === "black";
  const h = byBlack ? state.hidden : state.hiddenB;
  // (베타) 지뢰룰: 지뢰 자리를 맞히면 지뢰가 해체되어 사라진다(매직스톤도 생기지 않는다)
  const mn = byBlack && state.config.whiteMine ? state.mine : null;
  if (mn && !mn.triggered) {
    const mhit = samePos(mn.pos, pos);
    if (!mhit && (state.board[pos.row][pos.col] !== null || blockedCells(state).some((b) => samePos(b, pos)))) return { ok: false, reason: "occupied" };
    const rec = { pos: { row: pos.row, col: pos.col }, at: state.moves.length, hit: mhit };
    return { ok: true, hit: mhit, state: { ...state, scan: rec, mine: mhit ? { ...mn, triggered: true, defused: true } : mn, lastCaptured: [] } };
  }
  const hit = !!h && h.index >= 0 && !h.revealed && samePos(h.pos, pos);
  if (!hit && (state.board[pos.row][pos.col] !== null || blockedCells(state).some((b) => samePos(b, pos)))) return { ok: false, reason: "occupied" };
  const rec = { pos: { row: pos.row, col: pos.col }, at: state.moves.length, hit };
  const h2 = hit ? { ...h!, revealed: true } : h ?? null;
  let next: GameState = byBlack ? { ...state, scan: rec, hidden: h2, lastCaptured: [] } : { ...state, scanW: rec, hiddenB: h2, lastCaptured: [] };
  if (hit && state.config.scanRemoves) {
    // (실험) 맞히면 숨은 돌을 걷어 낸다
    const board = next.board.map((r) => r.slice());
    board[pos.row][pos.col] = null;
    next = { ...next, board, lastMove: samePos(next.lastMove, pos) ? null : next.lastMove };
  }
  if (state.config.scanCostsMove) next = { ...next, currentPlayer: opponent(state.currentPlayer) }; // (실험) 스캔에 한 수를 쓴다
  return { ok: true, hit, state: next };
}

/**
 * `viewer`에게 보이는 판. 아직 드러나지 않은 백 히든 돌은 백만 볼 수 있다(흑·관전자에게는 빈칸, 기보 좌표도 가린다).
 */
export function viewFor(state: GameState, viewer: Player | null): GameState {
  let s = state;
  const h = s.hidden;
  if (h && !h.revealed && viewer !== "white" && h.pos.row >= 0) {
    const board = s.board.map((r) => r.slice());
    if (board[h.pos.row][h.pos.col] === "white") board[h.pos.row][h.pos.col] = null;
    const moves = s.moves.map((m, i) => (i === h.index ? { row: -1, col: -1 } : m));
    s = { ...s, board, moves, lastMove: samePos(s.lastMove, h.pos) ? null : s.lastMove, hidden: { ...h, pos: { row: -1, col: -1 } } };
  }
  const hb = s.hiddenB;
  if (hb && !hb.revealed && viewer !== "black" && hb.pos.row >= 0) {
    const board = s.board.map((r) => r.slice());
    if (board[hb.pos.row][hb.pos.col] === "black") board[hb.pos.row][hb.pos.col] = null;
    const moves = s.moves.map((m, i) => (i === hb.index ? { row: -1, col: -1 } : m));
    s = { ...s, board, moves, lastMove: samePos(s.lastMove, hb.pos) ? null : s.lastMove, hiddenB: { ...hb, pos: { row: -1, col: -1 } } };
  }
  const mn = s.mine;
  if (mn && !mn.triggered && viewer !== "white" && !s.isFinished) s = { ...s, mine: { ...mn, pos: { row: -1, col: -1 } } };
  return s;
}

/**
 * 착수 한 번을 처리한다(지시서 §6 순서). 원본 state는 수정하지 않는다.
 * `player`를 넘기면 서버처럼 "누가 두려 하는지"까지 검증한다.
 * 흑이 아직 드러나지 않은 백 히든 돌 자리에 두려 하면, 돌이 드러나고 흑 차례가 그대로 이어진다(revealedHidden).
 */
export function tryMove(state: GameState, position: Position, player: Player = state.currentPlayer, opts: MoveOptions = {}): MoveResult {
  const h = state.hidden;
  // 상대의 숨은 돌 자리를 누르면(숨기려고 눌렀어도) 그 돌이 드러나고 차례는 그대로
  if (h && !h.revealed && !state.isFinished && player === state.currentPlayer && player === "black" && samePos(h.pos, position)) {
    return { ok: true, state: { ...state, hidden: { ...h, revealed: true }, lastCaptured: [] }, captured: [], revealedHidden: true };
  }
  const hb0 = state.hiddenB;
  if (hb0 && !hb0.revealed && !state.isFinished && player === state.currentPlayer && player === "white" && samePos(hb0.pos, position)) {
    return { ok: true, state: { ...state, hiddenB: { ...hb0, revealed: true }, lastCaptured: [] }, captured: [], revealedHidden: true };
  }
  const reason = whyIllegal(state, position, player);
  if (reason) return { ok: false, reason };
  if (opts.hidden && !canUseHidden(state)) return { ok: false, reason: "hidden-unavailable" };
  // (실험) 흑이 백의 지뢰를 밟았다: 그 자리는 매직스톤이 되고 흑은 이 차례를 잃는다(기보에는 밟은 자리로 남는다)
  const mn = state.mine;
  if (mn && !mn.triggered && player === "black" && samePos(mn.pos, position)) {
    const p0 = { row: position.row, col: position.col };
    return { ok: true, captured: [], state: { ...state, mine: { ...mn, triggered: true }, magic: [...(state.magic ?? []), { pos: p0, at: state.moves.length + 1, hit: false }],
      moves: [...state.moves, p0], moveCount: state.moveCount + 1, lastMove: p0, lastCaptured: [], currentPlayer: "white" } };
  }

  const me = state.currentPlayer;
  const pos = { row: position.row, col: position.col };

  // 5. 착수
  const board = state.board.map((r) => r.slice());
  board[pos.row][pos.col] = me;

  // 6–7. 이번 착수점 기준 8방향 포획 대상 수집
  const immune = state.config.whiteFirstStoneImmune && state.moves.length >= 2 ? state.moves[1] : null;
  const captured = getCapturedStones(board, pos, me, immune, anchorCells(state));

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
    hidden: opts.hidden && me === "white" ? { index: state.moves.length, pos, revealed: false } : state.hidden,
    hiddenB: opts.hidden && me === "black" ? { index: state.moves.length, pos, revealed: false } : state.hiddenB ?? null,
    scanW: state.scanW ?? null,
    magic: state.magic,
    mine: state.mine,
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
    if ((opts.hidden && me === "white") || anchored || captured.some((c) => samePos(c, hs.pos))) next.hidden = { ...hs, revealed: true };
  }
  // 흑 히든도 같은 방식으로 드러난다
  const hbs = next.hiddenB;
  if (hbs && !hbs.revealed && hbs.index >= 0 && captured.length) {
    const anchoredB = me === "black" && DIRECTIONS.some(([dr, dc]) =>
      pos.row + 3 * dr === hbs.pos.row && pos.col + 3 * dc === hbs.pos.col
      && captured.some((c) => c.row === pos.row + dr && c.col === pos.col + dc));
    if ((opts.hidden && me === "black") || anchoredB || captured.some((c) => samePos(c, hbs.pos))) next.hiddenB = { ...hbs, revealed: true };
  }

  // 숨긴 뒤 백이 HIDDEN_TURNS수를 더 두면 드러난다
  if (me === "white" && !opts.hidden && next.hidden && !next.hidden.revealed && next.hidden.index >= 0 && hiddenTurnsLeft(next) === 0) {
    next.hidden = { ...next.hidden, revealed: true };
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
  } else if (!board.some((row, r) => row.some((c, cc) => c === null && !blockedCells(state).some((b) => samePos(b, { row: r, col: cc }))))) {
    // 판이 다 찼고(포획으로 생긴 빈칸도 없음) 승자가 없으면 무승부
    next.winReason = "draw";
    next.isFinished = true;
  } else {
    // 13. 차례 넘김
    next.currentPlayer = opponent(me);
  }
  // 대국이 끝나면 숨은 돌도 드러난다
  if (next.isFinished && next.hidden && !next.hidden.revealed) next.hidden = { ...next.hidden, revealed: true };
  if (next.isFinished && next.hiddenB && !next.hiddenB.revealed) next.hiddenB = { ...next.hiddenB, revealed: true };
  return { ok: true, state: next, captured };
}

/** 착수를 적용한 새 상태를 돌려준다. 둘 수 없는 곳이면 같은 state 객체를 그대로 돌려준다(상태 변경 없음). */
export function applyMove(state: GameState, position: Position, player?: Player): GameState {
  const result = tryMove(state, position, player);
  return result.ok ? result.state : state;
}

