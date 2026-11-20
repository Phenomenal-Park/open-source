/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_ADSENSE_SLOT_PROFILE?: string;
  readonly VITE_ADSENSE_SLOT_RECORDS?: string;
  /** 문의 페이지에 보일 운영자 이메일 */
  readonly VITE_CONTACT_EMAIL?: string;
  /** (실험용) 흑 두 번째 수 제한 칸 수, 서버의 SECOND_MOVE_MIN_DISTANCE와 같게 */
  readonly VITE_SECOND_MOVE_MIN_DISTANCE?: string;
}
