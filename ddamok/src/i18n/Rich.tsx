// **굵게** 표시가 있는 번역문을 그린다(HTML을 문자열로 넣지 않기 위해).
export function Rich({ text }: { text: string }) {
  return <>{text.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}</>;
}
