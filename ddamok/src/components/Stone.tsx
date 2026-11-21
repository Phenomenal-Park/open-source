import type { Player } from "../game/index.ts";
import { useLook } from "../theme.ts";

interface StoneProps {
  player: Player;
  cx: number;
  cy: number;
  r: number;
  className?: string;
  opacity?: number;
}

/** 바둑돌. 모양(기본·단순·고급)은 설정에 따른다. 애니메이션 클래스는 돌 전체(그림자·광택 포함)에 걸린다. */
export function Stone({ player, cx, cy, r, className, opacity }: StoneProps) {
  const { stones } = useLook();
  const style = { transformOrigin: `${cx}px ${cy}px` };
  if (stones === "cartoon") {
    // 만화풍: 단색 + 굵은 테두리, 흑돌엔 작은 반짝임
    return (
      <g className={className} opacity={opacity} style={style}>
        <circle cx={cx} cy={cy} r={r * 0.94} fill={player === "black" ? "#151515" : "#ffffff"} stroke="#111" strokeWidth={0.75} />
        {player === "black"
          ? <ellipse cx={cx - r * 0.32} cy={cy - r * 0.36} rx={r * 0.22} ry={r * 0.13} fill="#fff" opacity={0.75} transform={`rotate(-35 ${cx - r * 0.32} ${cy - r * 0.36})`} />
          : <path d={`M ${cx + r * 0.2} ${cy + r * 0.62} A ${r * 0.66} ${r * 0.66} 0 0 0 ${cx + r * 0.62} ${cy + r * 0.2}`} fill="none" stroke="#cfcfcf" strokeWidth={0.55} strokeLinecap="round" />}
      </g>
    );
  }
  if (stones === "premium") {
    // 고급: 흑은 슬레이트(무광 깊은 검정 + 은은한 반사), 백은 조개(따뜻한 흰색 + 결)
    return (
      <g className={className} opacity={opacity} style={style}>
        <circle cx={cx} cy={cy} r={r} fill={`url(#stone-${player}-premium)`} />
        {player === "white" && <circle cx={cx} cy={cy} r={r} fill="url(#shell-lines)" />}
        <circle cx={cx} cy={cy} r={r} fill={`url(#stone-gloss-${player})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={player === "white" ? "rgba(90,70,40,.35)" : "rgba(0,0,0,.6)"} strokeWidth={0.25} />
      </g>
    );
  }
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
      style={style}
    />
  );
}

/** (시험) 매직스톤: 에메랄드빛 중립 돌 */
export function MagicStone({ cx, cy, r, className }: { cx: number; cy: number; r: number; className?: string }) {
  return (
    <g className={className} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={r} fill="url(#stone-magic)" stroke="rgba(0,60,40,.55)" strokeWidth={0.3} />
      <ellipse cx={cx - r * 0.3} cy={cy - r * 0.34} rx={r * 0.26} ry={r * 0.15} fill="#fff" opacity={0.55} transform={`rotate(-35 ${cx - r * 0.3} ${cy - r * 0.34})`} />
    </g>
  );
}

/** SVG <defs>에 한 번만 넣는 돌·판 그림 재료 */
export function StoneDefs() {
  return (
    <defs>
      <radialGradient id="stone-black" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#5a5a5a" />
        <stop offset="45%" stopColor="#1d1d1d" />
        <stop offset="100%" stopColor="#050505" />
      </radialGradient>
      <radialGradient id="stone-magic" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#8ff0c4" />
        <stop offset="45%" stopColor="#17a673" />
        <stop offset="100%" stopColor="#065c3e" />
      </radialGradient>
      <radialGradient id="stone-white" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="70%" stopColor="#ebe7de" />
        <stop offset="100%" stopColor="#c9c3b6" />
      </radialGradient>

      {/* 고급 돌 */}
      <radialGradient id="stone-black-premium" cx="42%" cy="38%" r="70%">
        <stop offset="0%" stopColor="#3c3d40" />
        <stop offset="55%" stopColor="#141518" />
        <stop offset="100%" stopColor="#030304" />
      </radialGradient>
      <radialGradient id="stone-white-premium" cx="40%" cy="35%" r="78%">
        <stop offset="0%" stopColor="#fffdf7" />
        <stop offset="60%" stopColor="#f1ebdd" />
        <stop offset="90%" stopColor="#d9cfbb" />
        <stop offset="100%" stopColor="#c4b89f" />
      </radialGradient>
      <radialGradient id="stone-gloss-black" cx="34%" cy="26%" r="34%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.42} />
        <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="stone-gloss-white" cx="33%" cy="27%" r="30%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
        <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
      </radialGradient>
      {/* 조개 결: 아주 옅은 가는 줄 */}
      <pattern id="shell-lines" width={1.1} height={1.1} patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
        <line x1={0} y1={0.3} x2={1.1} y2={0.3} stroke="#b9ab8f" strokeWidth={0.12} strokeOpacity={0.35} />
      </pattern>

      {/* 고급 바둑판: 비자나무 빛 + 나무결 */}
      <linearGradient id="wood-premium" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#e7c27d" />
        <stop offset="50%" stopColor="#ddb46a" />
        <stop offset="100%" stopColor="#cf9f55" />
      </linearGradient>
      <filter id="wood-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.22" numOctaves={3} seed={7} />
        <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.24  0 0 0 0 0.07  0 0 0 0.9 -0.32" />
      </filter>

      <filter id="stone-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0.5" dy="0.8" stdDeviation="0.6" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}
