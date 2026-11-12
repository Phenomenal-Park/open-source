// Temporary mark (§3: don't overinvest — a professional logo may be commissioned later).
// A rounded square like the stall markers, with "MD" (MyeongDong). Inverts automatically in dark mode.
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo" style={{ flex: "none", display: "block" }}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--logo-bg)" />
      <text x="16" y="21.2" textAnchor="middle" fontFamily="'Pretendard Variable', Pretendard, -apple-system, sans-serif" fontWeight="900"
        fontSize="13.5" letterSpacing="-0.6" fill="var(--logo-fg)">MD</text>
      <rect x="22.5" y="5" width="4.5" height="4.5" rx="1.2" fill="#ef3b3b" />
    </svg>
  );
}
