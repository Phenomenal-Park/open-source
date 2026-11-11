// Inline SVG icon set (consistent on iOS / Android / desktop; no emoji rendering).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 22, rest: SVGProps<SVGSVGElement>) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...rest,
});

export const IconGlobe = ({ size, ...r }: P) => (<svg {...base(size, r)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z" /></svg>);
export const IconMenu = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M4 6.5h16M4 12h16M4 17.5h16" /></svg>);
export const IconChevronRight = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M9.5 6l6 6-6 6" /></svg>);
export const IconChevronDown = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M6 9.5l6 6 6-6" /></svg>);
export const IconBack = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M20 12H5M11 5l-7 7 7 7" /></svg>);
export const IconArrowRight = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M4 12h15M13 5l7 7-7 7" /></svg>);
export const IconLocate = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M20.5 3.5L3.5 10.6l7.2 2.7 2.7 7.2z" /></svg>);
export const IconPlus = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconMinus = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M5 12h14" /></svg>);
export const IconX = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconCheck = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const IconSearch = ({ size, ...r }: P) => (<svg {...base(size, r)}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3" /></svg>);
export const IconBag = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M5.5 8h13l-1 12.5h-11z" /><path d="M9 8V6.5a3 3 0 016 0V8" /></svg>);
export const IconClock = ({ size, ...r }: P) => (<svg {...base(size, r)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>);
export const IconCard = ({ size, ...r }: P) => (<svg {...base(size, r)}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18" /></svg>);
export const IconLeaf = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19l8-8" /></svg>);
export const IconTrash = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" /></svg>);
export const IconChat = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M12 20c4.97 0 9-3.58 9-8s-4.03-8-9-8-9 3.58-9 8c0 1.9.75 3.65 2 5l-1 3.5 4-1.4c1.2.57 2.6.9 4 .9z" /><path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.6" /></svg>);
export const IconMap = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M9 4.5L3.5 7v12.5L9 17l6 2.5 5.5-2.5V4.5L15 7z" /><path d="M9 4.5V17M15 7v12.5" /></svg>);
export const IconPin = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>);
export const IconImage = ({ size, ...r }: P) => (<svg {...base(size, r)}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.7" /><path d="M20.5 16l-5-5-8.5 8.5" /></svg>);
export const IconRefresh = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M20 11a8 8 0 00-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0014.3 4.9L20 16M20 20v-4h-4" /></svg>);
export const IconInfo = ({ size, ...r }: P) => (<svg {...base(size, r)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.01" strokeWidth="2.2" /></svg>);
export const IconDirections = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M12 2.8l9.2 9.2-9.2 9.2L2.8 12z" /><path d="M9 13.5V11h6M13 9l2 2-2 2" /></svg>);
export const IconStore = ({ size, ...r }: P) => (<svg {...base(size, r)}><path d="M4 9.5L5.5 4.5h13L20 9.5M4 9.5v10h16v-10M4 9.5c0 1.4 1.1 2.5 2.7 2.5S9.3 10.9 9.3 9.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5" /></svg>);

export function Star({ size = 16, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="star">
      <path d="M12 2.8l2.85 5.9 6.45.85-4.72 4.48 1.2 6.4L12 17.3l-5.78 3.13 1.2-6.4L2.7 9.55l6.45-.85z"
        fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.6} strokeLinejoin="round" />
    </svg>
  );
}
