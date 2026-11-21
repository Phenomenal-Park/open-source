import type { Cell, Player, Position } from "./types.ts";
import { DIRECTIONS, inBounds, opponent } from "./config.ts";

/**
 * `player`가 `position`에 방금 착수했다고 보고, 이 착수로 완성된 포획 대상 돌을 돌려준다.
 *
 * 판정 기준은 오직 착수점이다. 착수점 P에서 한 방향으로
 *   P(자기) - 상대 - 상대 - 자기
 * 배열일 때만 가운데 상대 돌 두 개를 따낸다. 8방향을 각각 독립적으로 검사한다.
 *
 * - board[position]의 현재 값은 읽지 않는다(착수 전·후 어느 판을 넘겨도 같은 결과).
 * - 판 위에 이미 존재하는 ●○○● 모양(자충 등)은 착수점이 양 끝 중 하나가 아니면 절대 잡히지 않는다.
 * - 같은 좌표는 한 번만 담는다.
 */
export function getCapturedStones(
  board: readonly (readonly Cell[])[],
  position: Position,
  player: Player,
  /** (실험용) 절대 따이지 않는 돌 — 이 돌이 낀 두 돌은 둘 다 따이지 않는다 */
  immune: Position | null = null,
  /** (실험) 초록돌: 양쪽 모두의 받침이 되는 중립 돌 자리 */
  anchor: Position | null = null,
): Position[] {
  const size = board.length;
  const enemy = opponent(player);
  const seen = new Set<number>();
  const captured: Position[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const r1 = position.row + dr, c1 = position.col + dc;
    const r2 = position.row + 2 * dr, c2 = position.col + 2 * dc;
    const r3 = position.row + 3 * dr, c3 = position.col + 3 * dc;
    if (!inBounds(size, r3, c3)) continue; // 판 밖으로 넘어가는 판정은 없다 (r1, r2는 r3보다 안쪽)
    if (board[r1][c1] !== enemy || board[r2][c2] !== enemy) continue;
    if (board[r3][c3] !== player && !(anchor && anchor.row === r3 && anchor.col === c3)) continue;
    if (immune && ((immune.row === r1 && immune.col === c1) || (immune.row === r2 && immune.col === c2))) continue;
    for (const [r, c] of [[r1, c1], [r2, c2]] as const) {
      const key = r * size + c;
      if (!seen.has(key)) {
        seen.add(key);
        captured.push({ row: r, col: c });
      }
    }
  }
  return captured;
}
