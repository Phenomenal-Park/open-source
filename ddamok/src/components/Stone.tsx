import type { Player } from "../game/index.ts";

interface StoneProps {
  player: Player;
  cx: number;
  cy: number;
  r: number;
  className?: string;
  opacity?: number;
}

export function Stone({ player, cx, cy, r, className, opacity }: StoneProps) {
  return (
    <circle
      className={className}
      cx={cx}
      cy={cy}
      r={r}
      fill={`url(#stone-${player})`}
      stroke={player === "white" ? "rgba(0,0,0,.35)" : "none"}
      strokeWidth={player === "white" ? 0.35 : 0}
      opacity={opacity}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    />
  );
}

/** SVG <defs>에 한 번만 넣는 돌 그라데이션 */
export function StoneDefs() {
  return (
    <defs>
      <radialGradient id="stone-black" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#5a5a5a" />
        <stop offset="45%" stopColor="#1d1d1d" />
        <stop offset="100%" stopColor="#050505" />
      </radialGradient>
      <radialGradient id="stone-white" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="70%" stopColor="#ebe7de" />
        <stop offset="100%" stopColor="#c9c3b6" />
      </radialGradient>
      <filter id="stone-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0.5" dy="0.8" stdDeviation="0.6" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}
