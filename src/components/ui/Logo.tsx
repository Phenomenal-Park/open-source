// Temporary mark (§3: don't overinvest — a professional logo may be commissioned later).
// A rounded square like the stall markers, with "MD" (MyeongDong). Inverts automatically in dark mode.
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo" style={{ flex: "none", display: "block" }}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--logo-bg)" />
      {/* "MD" as outlines (Pretendard Black) — identical on every device, no font needed */}
      <path d="M6.35 11.66L6.35 21.20L8.80 21.20L8.80 15.54L8.88 15.54L11.04 21.13L12.55 21.13L14.72 15.58L14.80 15.58L14.80 21.20L17.25 21.20L17.25 11.66L14.13 11.66L11.86 17.21L11.74 17.21L9.47 11.66ZM21.57 21.20C24.48 21.20 26.32 19.41 26.32 16.43C26.32 13.45 24.48 11.66 21.54 11.66L17.94 11.66L17.94 21.20ZM20.45 19.06L20.45 13.79L21.41 13.79C22.95 13.79 23.78 14.41 23.78 16.43C23.78 18.44 22.95 19.06 21.48 19.06Z" fill="var(--logo-fg)" />
      <rect x="22.5" y="5" width="4.5" height="4.5" rx="1.2" fill="#ef3b3b" />
    </svg>
  );
}
