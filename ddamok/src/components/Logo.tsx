/** 히든따목 로고: 원 4개가 반씩 겹친 모양(흑·백·백·흑 — 두 백을 흑이 양쪽에서 끼운 따내기 모양). 세 번째 백은 숨은 돌(반투명·점선) */
export function Logo({ size = 26 }: { size?: number }) {
  // 숨은 돌(30)은 맨 위에 그려 점선 테두리가 다 보이게 한다
  const stones: [number, "b" | "w"][] = [[10, "b"], [20, "w"], [40, "b"], [30, "w"]];
  return (
    <svg className="logo" viewBox="0 0 50 20" width={size * 2.5} height={size} aria-hidden>
      {stones.map(([cx, c]) => (
        cx === 30
          ? <circle key={cx} cx={cx} cy={10} r={9.2} fill="#f4f1ea" fillOpacity={0.75} stroke="#f4f1ea" strokeWidth={1.2} strokeDasharray="2.4 1.6" />
          : <circle key={cx} cx={cx} cy={10} r={9.2} fill={c === "b" ? "#141414" : "#f4f1ea"} stroke={c === "b" ? "#6b6b6b" : "#141414"} strokeWidth={1.2} />
      ))}
    </svg>
  );
}
