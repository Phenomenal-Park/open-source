import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = { title: "관리자 · 명동 노점 지도", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
const themeScript = `try{var t=localStorage.getItem('msm_theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
