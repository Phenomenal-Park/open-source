/** 따목 로고: 원 4개가 반씩 겹친 모양(흑·백·백·흑 — 두 백을 흑이 양쪽에서 끼운 따내기 모양) */
export function Logo({ size = 26 }: { size?: number }) {
  const stones: [number, "b" | "w"][] = [[10, "b"], [20, "w"], [30, "w"], [40, "b"]];
  return (
    <svg className="logo" viewBox="0 0 50 20" width={size * 2.5} height={size} aria-hidden>
      {stones.map(([cx, c]) => (
        <circle key={cx} cx={cx} cy={10} r={9.2} fill={c === "b" ? "#141414" : "#f4f1ea"} stroke={c === "b" ? "#6b6b6b" : "#141414"} strokeWidth={1.2} />
      ))}
    </svg>
  );
}
