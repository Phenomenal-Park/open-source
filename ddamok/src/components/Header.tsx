// 상단 제목 + 메뉴. 메뉴는 일반 링크(페이지 전체를 새로 연다 — 광고 정책상 화면 전환 = 새 페이지).
export type Page = "play" | "records" | "profile" | "privacy";

export function Header({ page }: { page: Page }) {
  const link = (href: string, label: string, p: Page) => (
    <a href={href} className={page === p ? "nav-link active" : "nav-link"} aria-current={page === p ? "page" : undefined}>{label}</a>
  );
  return (
    <header className="app-header">
      <a href="/" className="brand"><h1>따목</h1></a>
      <nav className="nav">
        {link("/", "대국", "play")}
        {link("/records", "기보", "records")}
        {link("/profile", "프로필", "profile")}
      </nav>
    </header>
  );
}
