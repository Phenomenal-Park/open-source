// 따목 AI — 연속 위협 탐색(VCF: Victory by Continuous Forcing).
//
// 공격자가 "다음 수에 이기는 자리"(5목 자리 또는 포획 승리 자리)를 만드는 수만 연달아 두어 이기는 수순을 찾는다.
// 따목에서 수비자가 할 수 있는 응수는 셋뿐이다:
//   (1) 위협 자리를 막는다  (2) 따내기로 공격 돌을 없앤다  (3) 자기가 먼저 이긴다
// 수비자의 모든 응수에 대해 공격자가 계속 이길 때만 "필승 수순"으로 본다.
import type { GameState, Player, Position } from "../game/types.ts";
import { opponent } from "../game/config.ts";
import { tryMove } from "../game/rules.ts";
import { getCapturedStones } from "../game/captures.ts";
import { findFiveInRow, capturedBy } from "../game/victory.ts";
import { candidateMoves } from "./evaluate.ts";

/** 지금 `player`가 둔다면 바로 이기는 빈칸들(차례와 무관하게 계산). */
export function winningCells(state: GameState, player: Player): Position[] {
  const board = state.board.map((r) => r.slice());
  const target = state.config.captureTarget[player];
  const have = capturedBy(state, player);
  const out: Position[] = [];
  for (const c of candidateMoves(state.board)) {
    board[c.row][c.col] = player;
    const win =
      findFiveInRow(board, c, player, state.config.overlineWins) !== null ||
      have + getCapturedStones(board, c, player).length >= target;
    board[c.row][c.col] = null;
    if (win) out.push(c);
  }
  return out;
}

/** `player`가 두면 따낼 수 있는 자리(수비자의 "따내서 깨기" 후보). */
function captureMoves(state: GameState, player: Player): Position[] {
  return candidateMoves(state.board).filter((c) => getCapturedStones(state.board, c, player).length > 0);
}

export interface VcfContext {
  nodes: number;
  limit: number;
}

const key = (p: Position) => p.row * 64 + p.col;

/**
 * 둘 차례인 사람(공격자)의 필승 연속 위협 첫 수를 찾는다. 없거나 계산 한도를 넘으면 null.
 * depth: 공격자가 둘 수 있는 위협 수의 최대 개수.
 */
export function findVcf(state: GameState, depth: number, ctx: VcfContext): Position | null {
  if (state.isFinished || depth <= 0) return null;
  const attacker = state.currentPlayer;
  const defender = opponent(attacker);

  const now = winningCells(state, attacker);
  if (now.length) return now[0];
  // 수비자가 이미 이기는 자리가 있으면, 공격자의 위협은 먼저 이기지 못하므로 실패
  if (winningCells(state, defender).length) return null;

  for (const m of candidateMoves(state.board)) {
    if (++ctx.nodes > ctx.limit) return null;
    const r = tryMove(state, m);
    if (!r.ok) continue;
    if (r.state.isFinished) return m;
    const threats = winningCells(r.state, attacker);
    if (!threats.length) continue; // 강제수가 아님

    // 수비자 응수 후보: 위협 자리 막기 + 따내기(공격 돌 제거). 수비자가 바로 이기는 자리가 있으면 실패.
    if (winningCells(r.state, defender).length) continue;
    const seen = new Set<number>();
    const replies: Position[] = [];
    for (const p of [...threats, ...captureMoves(r.state, defender)]) {
      if (!seen.has(key(p))) { seen.add(key(p)); replies.push(p); }
    }
    let allWin = true;
    for (const reply of replies) {
      const d = tryMove(r.state, reply);
      if (!d.ok) continue;
      if (d.state.isFinished) { allWin = false; break; } // 수비자 승리(포획 승리 등)
      if (winningCells(d.state, attacker).length) continue; // 위협이 남아 있음 → 공격자 다음 수에 승리
      if (!findVcf(d.state, depth - 1, ctx)) { allWin = false; break; }
      if (ctx.nodes > ctx.limit) return null;
    }
    if (allWin) return m;
  }
  return null;
}
