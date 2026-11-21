import { useRef, useState, type PointerEvent } from "react";
import { isLegalMove, secondMoveRestricted, type GameState, type Player, type Position } from "../game/index.ts";
import { Stone, StoneDefs } from "./Stone.tsx";
import { t } from "../i18n/index.ts";
import { useLook } from "../theme.ts";

const CELL = 10;
const PAD = 7;
const R = CELL * 0.46;

export interface CaptureFx {
  id: number;
  stones: Position[];
  color: Player;
}

interface BoardProps {
  state: GameState;
  onPlay: (pos: Position) => void;
  disabled?: boolean;
  fx: CaptureFx | null;
  /** 백 히든: 내(백)가 숨겨 둔 돌 — 흐리게 보인다 */
  ghost?: Position | null;
  /** 숨은 돌이 드러나기까지 남은 백의 수(백에게만, 숨긴 돌 위에 숫자로) */
  ghostCount?: number | null;
  /** 백 히든: 드러난 숨은 돌 — 스르르 나타난다 */
  reveal?: Position | null;
  /** 기보: 히든으로 둔 돌 표시(점선 고리) */
  hiddenMark?: Position | null;
  /** 흑이 숨은 돌을 찾은 자리("찾았다!") */
  found?: { pos: Position; id: number } | null;
  /** 흑 스캔 고르는 중: 돌 대신 조준 표시 */
  scanning?: boolean;
  /** 방금 스캔한 자리: 노란 반짝임 가루가 퍼진다 */
  scanFx?: { pos: Position; id: number } | null;
}

function starPoints(n: number): Position[] {
  if (n < 9) return [];
  const e = n >= 13 ? 3 : 2;
  const c = Math.floor(n / 2);
  const lines = n === 19 ? [e, c, n - 1 - e] : [e, n - 1 - e];
  const pts = lines.flatMap((row) => lines.map((col) => ({ row, col })));
  if (n % 2 === 1 && n !== 19) pts.push({ row: c, col: c });
  return pts;
}

const xy = (i: number) => PAD + i * CELL;

export function Board({ state, onPlay, disabled, fx, ghost, ghostCount, reveal, found, hiddenMark, scanning, scanFx }: BoardProps) {
  const look = useLook();
  const n = state.config.boardSize;
  const size = PAD * 2 + (n - 1) * CELL;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Position | null>(null);

  function toPos(e: PointerEvent<SVGSVGElement>): Position | null {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size;
    const y = ((e.clientY - rect.top) / rect.height) * size;
    const col = Math.round((x - PAD) / CELL);
    const row = Math.round((y - PAD) / CELL);
    return row >= 0 && row < n && col >= 0 && col < n ? { row, col } : null;
  }

  const canHover = hover && !disabled && isLegalMove(state, hover);
  // 흑 두 번째 수 제한(켜진 대국만): 둘 수 없는 천원 주변 빈칸에 ⛔
  const banned: Position[] = [];
  if (secondMoveRestricted(state.config) && state.moveCount === 2 && !state.isFinished && state.currentPlayer === "black") {
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
      if (state.board[r][col] === null && !isLegalMove(state, { row: r, col })) banned.push({ row: r, col });
    }
  }
  const win = state.winningLine;

  return (
    <svg
      ref={svgRef}
      className={`board look-board-${look.board}${disabled || state.isFinished ? " is-locked" : ""}`}
      viewBox={`0 0 ${size} ${size}`}
      role="grid"
      aria-label={t("board.aria", { n })}
      onPointerUp={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const p = toPos(e);
        if (p && !disabled) onPlay(p);
      }}
      onPointerMove={(e) => setHover(e.pointerType === "mouse" ? toPos(e) : null)}
      onPointerLeave={() => setHover(null)}
    >
      <StoneDefs />
      <rect className="board-wood" x={0} y={0} width={size} height={size} rx={2} />
      {look.board === "premium" && <rect x={0} y={0} width={size} height={size} rx={2} filter="url(#wood-grain)" opacity={0.8} />}
      <g className="board-lines">
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            <line x1={xy(0)} y1={xy(i)} x2={xy(n - 1)} y2={xy(i)} />
            <line x1={xy(i)} y1={xy(0)} x2={xy(i)} y2={xy(n - 1)} />
          </g>
        ))}
      </g>
      {starPoints(n).map((p) => (
        <circle key={`s${p.row}-${p.col}`} className="star" cx={xy(p.col)} cy={xy(p.row)} r={1.1} />
      ))}

      <g filter="url(#stone-shadow)">
        {state.board.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <Stone
                key={`${r}-${c}-${cell}`}
                player={cell}
                cx={xy(c)}
                cy={xy(r)}
                r={R}
                className={
                  ghost?.row === r && ghost?.col === c ? "stone ghost"
                    : reveal?.row === r && reveal?.col === c ? "stone reveal"
                      : state.lastMove?.row === r && state.lastMove?.col === c ? "stone placed" : "stone"
                }
              />
            ) : null,
          ),
        )}
      </g>

      {fx && (
        <g key={fx.id} className="capture-fx">
          {fx.stones.map((p) => (
            <g key={`${p.row}-${p.col}`}>
              <Stone player={fx.color} cx={xy(p.col)} cy={xy(p.row)} r={R} className="captured" />
              <circle className="capture-ring" cx={xy(p.col)} cy={xy(p.row)} r={R} style={{ transformOrigin: `${xy(p.col)}px ${xy(p.row)}px` }} />
            </g>
          ))}
        </g>
      )}

      {state.config.firstMoveCenter && state.moveCount === 0 && !state.board.some((r) => r.some((c) => c)) && (
        <circle className="center-hint" cx={xy(Math.floor(n / 2))} cy={xy(Math.floor(n / 2))} r={R} />
      )}

      {banned.map((p) => (
        <text key={`ban-${p.row}-${p.col}`} className="banned" x={xy(p.col)} y={xy(p.row)} fontSize={CELL * 0.62} textAnchor="middle" dominantBaseline="central">⛔</text>
      ))}

      {canHover && !scanning && <Stone player={state.currentPlayer} cx={xy(hover!.col)} cy={xy(hover!.row)} r={R} opacity={0.4} />}
      {canHover && scanning && <ScanAim cx={xy(hover!.col)} cy={xy(hover!.row)} />}

      {/* 흑 스캔이 빗나간 자리(그 자리에 돌이 놓이기 전까지) */}
      {state.scan && !state.scan.hit && state.board[state.scan.pos.row]?.[state.scan.pos.col] === null && (
        <g className="scan-miss">
          <circle cx={xy(state.scan.pos.col)} cy={xy(state.scan.pos.row)} r={R * 0.8} />
          <path d={`M ${xy(state.scan.pos.col) - R * 0.38} ${xy(state.scan.pos.row) - R * 0.38} l ${R * 0.76} ${R * 0.76} m 0 ${-R * 0.76} l ${-R * 0.76} ${R * 0.76}`} />
        </g>
      )}

      {state.lastMove && (
        <circle className="last-move" cx={xy(state.lastMove.col)} cy={xy(state.lastMove.row)} r={1.5} />
      )}

      {ghost && ghostCount != null && (
        <text className="ghost-count" x={xy(ghost.col)} y={xy(ghost.row)} fontSize={CELL * 0.55} textAnchor="middle" dominantBaseline="central">{ghostCount}</text>
      )}

      {hiddenMark && (
        <circle className="hidden-mark" cx={xy(hiddenMark.col)} cy={xy(hiddenMark.row)} r={R + 1.1} />
      )}

      {scanFx && <ScanSparkle key={`scan-${scanFx.id}`} cx={xy(scanFx.pos.col)} cy={xy(scanFx.pos.row)} seed={scanFx.id} />}

      {found && (
        <text key={`found-${found.id}`} className="found-pop" x={xy(found.pos.col)} y={xy(found.pos.row) - CELL * 0.7} fontSize={CELL * 0.6} textAnchor="middle">{t("hidden.found")}</text>
      )}

      {win && (
        <line
          className="win-line"
          x1={xy(win[0].col)} y1={xy(win[0].row)}
          x2={xy(win[win.length - 1].col)} y2={xy(win[win.length - 1].row)}
        />
      )}
    </svg>
  );
}

/** 스캔 조준 표시: 고리 + 십자 */
function ScanAim({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g className="scan-aim">
      <circle cx={cx} cy={cy} r={R} />
      <path d={`M ${cx - R * 1.35} ${cy} h ${R * 0.7} M ${cx + R * 0.65} ${cy} h ${R * 0.7} M ${cx} ${cy - R * 1.35} v ${R * 0.7} M ${cx} ${cy + R * 0.65} v ${R * 0.7}`} />
    </g>
  );
}

/** 스캔 연출: 노란 고리가 퍼지고 반짝임 가루가 흩날린다 */
function ScanSparkle({ cx, cy, seed }: { cx: number; cy: number; seed: number }) {
  let x = (seed % 2147483647) || 1;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const sparks = Array.from({ length: 16 }, (_, i) => {
    const a = rnd() * Math.PI * 2, d = R * (0.4 + rnd() * 2.4), s = 0.35 + rnd() * 0.55;
    return { i, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, s, delay: rnd() * 0.45 };
  });
  return (
    <g className="scan-fx" aria-hidden>
      <circle className="scan-glow" cx={cx} cy={cy} r={R * 2.2} />
      <circle className="scan-sweep" cx={cx} cy={cy} r={R} />
      <circle className="scan-sweep late" cx={cx} cy={cy} r={R} />
      {sparks.map((p) => (
        <path
          key={p.i}
          className="scan-spark"
          style={{ animationDelay: `${p.delay}s` }}
          d={`M ${p.x} ${p.y - p.s * 1.6} L ${p.x + p.s * 0.4} ${p.y - p.s * 0.4} L ${p.x + p.s * 1.6} ${p.y} L ${p.x + p.s * 0.4} ${p.y + p.s * 0.4} L ${p.x} ${p.y + p.s * 1.6} L ${p.x - p.s * 0.4} ${p.y + p.s * 0.4} L ${p.x - p.s * 1.6} ${p.y} L ${p.x - p.s * 0.4} ${p.y - p.s * 0.4} Z`}
        />
      ))}
    </g>
  );
}
