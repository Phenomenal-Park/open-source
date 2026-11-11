// Custom rounded, friendly red chili (§47). Same graphic on every platform.
export function Chili({ size = 15, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: "block" }}>
      <path d="M14.6 6.2c.4-1.6 1.6-2.8 3.3-3.1" stroke={muted ? "#9aa29a" : "#3f9a4a"} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M12.7 6.8c1.1-.9 3-1 4.2.1 1.2 1.1 1.3 2.8.6 4.3C15.6 15.6 11.4 19.8 5.6 21c-1.3.3-2.2-.9-1.4-1.9 2.9-3.4 4.7-6.9 5.9-10.3.6-1.5 1.5-1.4 2.6-2z"
        fill={muted ? "#c9c3c3" : "#e5483b"} />
      <path d="M13.2 8.3c-.9.5-1.4 1.6-1.9 2.9" stroke="#fff" strokeOpacity={muted ? 0.4 : 0.55} strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M12.4 6.9c.6-.9 1.6-1.4 2.7-1.4 1.1 0 2.1.5 2.8 1.3-1.1-.4-2.4-.3-3.4.3-.8.4-1.6.3-2.1-.2z" fill={muted ? "#9aa29a" : "#3f9a4a"} />
    </svg>
  );
}

/** 0 → nothing (caller shows "Not spicy"), 1–3 → that many chilis. */
export function Chilis({ level, size = 14, label }: { level: number | null | undefined; size?: number; label?: string }) {
  if (!level) return null;
  return (
    <span className="chilis" role="img" aria-label={label ?? `${level}/3`}>
      {Array.from({ length: level }, (_, i) => <Chili key={i} size={size} />)}
    </span>
  );
}
