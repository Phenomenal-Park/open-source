// 개인정보 처리방침(초안) — 언어별. 운영자 연락처는 배포 전에 채운다.
import type { Lang } from "./index.ts";

export interface PrivacyText {
  title: string;
  draft: string;
  sections: { h: string; items: string[] }[];
}

export const PRIVACY: Record<Lang, PrivacyText> = {
  ko: {
    title: "개인정보 처리방침",
    draft: "초안입니다. 정식 서비스 전에 운영자 정보와 함께 검토가 필요합니다.",
    sections: [
      { h: "수집하는 정보", items: ["가입 시: 닉네임, 이메일 주소, 비밀번호(복원할 수 없는 형태로 암호화해 저장)", "이용 중: 대국 기록(기보, 승패, 점수 변화), 로그인 상태 유지를 위한 정보"] },
      { h: "이용 목적", items: ["회원 확인과 이메일 인증, 온라인 대국·점수·순위·기보 제공", "부정 이용 방지(요청 횟수 제한 등)"] },
      { h: "보관 기간", items: ["계정 정보: 탈퇴할 때까지", "기보: 사람별 최근 100판(초과분은 자동 삭제). 점수와 전적은 계정에 따로 보관됩니다."] },
      { h: "공개되는 정보", items: ["닉네임, 급·점수, 전적, 기보는 다른 이용자가 볼 수 있습니다. 이메일은 공개되지 않습니다."] },
      { h: "만 14세 미만", items: ["만 14세 미만은 가입할 수 없습니다."] },
      { h: "문의", items: ["운영자 연락처: (배포 전에 입력)"] },
    ],
  },
  en: {
    title: "Privacy Policy",
    draft: "Draft. To be reviewed with the operator's details before launch.",
    sections: [
      { h: "What we collect", items: ["At sign-up: nickname, email address, password (stored only as an irreversible hash)", "While you play: game records (moves, results, rating changes) and data needed to keep you logged in"] },
      { h: "Why", items: ["To identify members, verify email, and provide online games, ratings, rankings and records", "To prevent abuse (e.g. request limits)"] },
      { h: "How long", items: ["Account data: until you delete your account", "Game records: your latest 100 games (older ones are deleted automatically). Ratings and win/loss totals are kept with your account."] },
      { h: "What is public", items: ["Your nickname, rank, rating, record and game records are visible to other players. Your email is never shown."] },
      { h: "Children", items: ["You must be 14 or older to sign up."] },
      { h: "Contact", items: ["Operator contact: (to be added before launch)"] },
    ],
  },
  ja: {
    title: "プライバシーポリシー",
    draft: "草案です。正式サービス前に運営者情報とあわせて確認が必要です。",
    sections: [
      { h: "取得する情報", items: ["登録時：ニックネーム、メールアドレス、パスワード（復元できない形で暗号化して保存）", "利用中：対局記録（棋譜・勝敗・レーティングの変化）、ログイン状態を保つための情報"] },
      { h: "利用目的", items: ["会員の確認とメール認証、オンライン対局・レーティング・ランキング・棋譜の提供", "不正利用の防止（リクエスト回数の制限など）"] },
      { h: "保存期間", items: ["アカウント情報：退会するまで", "棋譜：1人あたり最近の100局（超えた分は自動削除）。レーティングと戦績はアカウントに別途保存されます。"] },
      { h: "公開される情報", items: ["ニックネーム、段級位・レーティング、戦績、棋譜は他の利用者が見られます。メールアドレスは公開されません。"] },
      { h: "14歳未満の方", items: ["14歳未満の方は登録できません。"] },
      { h: "お問い合わせ", items: ["運営者連絡先：（公開前に記入）"] },
    ],
  },
};
