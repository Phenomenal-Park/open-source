import { useEffect, useRef } from "react";
import { t } from "../i18n/index.ts";

// 광고 자리(프로필·기보·순위·업적 화면 전용 — 대국 화면·팝업에는 넣지 않는다).
// VITE_ADSENSE_CLIENT(ca-pub-...)와 slot이 설정되어 있을 때만 애드센스 광고를 넣는다. 설정이 없으면 아무것도 그리지 않는다.
// 프로필·기보는 링크로 페이지 전체를 새로 여는 구조라, 화면을 옮길 때마다 정책에 맞게 새 광고가 뜬다(자동 새로고침 없음).
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let scriptAdded = false;

export function AdSlot({ slot }: { slot: string | undefined }) {
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    if (!CLIENT || !slot || !ref.current) return;
    if (!scriptAdded) {
      const s = document.createElement("script");
      s.async = true;
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
      s.crossOrigin = "anonymous";
      document.head.appendChild(s);
      scriptAdded = true;
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* 광고 차단 등 */
    }
  }, [slot]);
  if (!CLIENT || !slot) return null;
  return (
    <div className="ad-slot" aria-label={t("ad.label")}>
      <ins ref={ref} className="adsbygoogle" style={{ display: "block" }} data-ad-client={CLIENT} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}

export const AD_SLOTS = {
  profile: import.meta.env.VITE_ADSENSE_SLOT_PROFILE as string | undefined,
  records: import.meta.env.VITE_ADSENSE_SLOT_RECORDS as string | undefined,
  rankings: import.meta.env.VITE_ADSENSE_SLOT_RANKINGS as string | undefined,
  rules: import.meta.env.VITE_ADSENSE_SLOT_RULES as string | undefined,
  achievements: import.meta.env.VITE_ADSENSE_SLOT_ACHIEVEMENTS as string | undefined,
};
