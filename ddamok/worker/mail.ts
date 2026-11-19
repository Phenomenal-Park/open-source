// 이메일 인증 코드 발송(가입한 언어로).
export type MailLang = "ko" | "en" | "ja";

const TEXT: Record<MailLang, { subject: string; body: (code: string) => string }> = {
  ko: { subject: "[따목] 이메일 인증 코드", body: (c) => `따목 이메일 인증 코드: ${c}\n\n10분 안에 입력해 주세요. 직접 요청하지 않았다면 이 메일을 무시하세요.` },
  en: { subject: "[Ddamok] Your verification code", body: (c) => `Your Ddamok verification code: ${c}\n\nEnter it within 10 minutes. If you didn't request this, you can ignore this email.` },
  ja: { subject: "【タモク】メール認証コード", body: (c) => `タモクのメール認証コード：${c}\n\n10分以内に入力してください。心当たりがない場合はこのメールを無視してください。` },
};

export function mailLang(v: unknown): MailLang {
  return v === "en" || v === "ja" ? v : "ko";
}

export async function sendVerificationCode(env: Env, to: string, code: string, lang: MailLang = "ko"): Promise<{ devCode?: string }> {
  const text = TEXT[lang];
  if (env.EMAIL && env.MAIL_FROM) {
    await env.EMAIL.send({ to, from: env.MAIL_FROM, subject: text.subject, text: text.body(code) });
    return {};
  }
  if (env.DEV_MAIL_LOG === "1") {
    console.log(`[개발용] ${to} 인증 코드: ${code}`);
    return { devCode: code };
  }
  throw new Error("메일 발송 설정(EMAIL, MAIL_FROM)이 없습니다.");
}
