import { useRef, useState, type PointerEvent } from "react";
import type { GameState, Player, Position } from "../game/index.ts";
import { Stone, StoneDefs } from "./Stone.tsx";

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

export function Board({ state, onPlay, disabled, fx }: BoardProps) {
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

  const canHover = hover && !disabled && !state.isFinished && state.board[hover.row][hover.col] === null;
  const win = state.winningLine;

  return (
    <svg
      ref={svgRef}
      className={`board${disabled || state.isFinished ? " is-locked" : ""}`}
      viewBox={`0 0 ${size} ${size}`}
      role="grid"
      aria-label={`${n}×${n} 바둑판`}
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
                className={state.lastMove?.row === r && state.lastMove?.col === c ? "stone placed" : "stone"}
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

      {canHover && <Stone player={state.currentPlayer} cx={xy(hover!.col)} cy={xy(hover!.row)} r={R} opacity={0.4} />}

      {state.lastMove && (
        <circle className="last-move" cx={xy(state.lastMove.col)} cy={xy(state.lastMove.row)} r={1.5} />
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
