/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_ADSENSE_SLOT_PROFILE?: string;
  readonly VITE_ADSENSE_SLOT_RECORDS?: string;
  /** 문의 페이지에 보일 운영자 이메일 */
  readonly VITE_CONTACT_EMAIL?: string;
}
