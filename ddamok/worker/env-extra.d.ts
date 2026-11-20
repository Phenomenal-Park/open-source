// wrangler.jsonc 에 없는 선택적 바인딩·변수(배포 환경에서 설정).
interface Env {
  /** Cloudflare Email Service(send_email 바인딩). 없으면 메일을 보낼 수 없다(개발 중엔 DEV_MAIL_LOG 사용). */
  EMAIL?: { send(message: { to: string; from: string; subject: string; text: string; html?: string }): Promise<unknown> };
  /** 보내는 사람 주소(예: "따목 <no-reply@example.com>") */
  MAIL_FROM?: string;
  /** "1"이면 인증 코드를 메일 대신 로그와 응답(devCode)에 싣는다. 로컬 개발 전용 — wrangler dev --var DEV_MAIL_LOG:1 */
  DEV_MAIL_LOG?: string;
  /** 신호 확인 시간(기본 25000ms). 테스트용으로만 바꾼다. */
  HEARTBEAT_TIMEOUT_MS?: string;
  /** (실험용) 흑 두 번째 수 제한 칸 수(기본 0 = 꺼짐). 화면의 VITE_SECOND_MOVE_MIN_DISTANCE와 같게 */
  SECOND_MOVE_MIN_DISTANCE?: string;
  /** 백 히든 규칙(기본 켜짐, "0"이면 끔 — 끄면 따냄 목표는 흑 12 / 백 10) */
  HIDDEN_MOVE?: string;
  /** 대국 시계 처음 시간(ms). 테스트용으로만 바꾼다(기본: 레이팅·친선 3분, 친구 선택) */
  CLOCK_TEST_MS?: string;
  /** 온라인 대국 판 크기(기본 15). 테스트용으로만 바꾼다. */
  BOARD_SIZE?: string;
  /** 사람별 기보 보관 개수(기본 100). 테스트용으로만 바꾼다. */
  RECORDS_LIMIT?: string;
}
