// 이메일 인증 코드 발송.
export async function sendVerificationCode(env: Env, to: string, code: string): Promise<{ devCode?: string }> {
  if (env.EMAIL && env.MAIL_FROM) {
    await env.EMAIL.send({
      to,
      from: env.MAIL_FROM,
      subject: "[따목] 이메일 인증 코드",
      text: `따목 이메일 인증 코드: ${code}\n\n10분 안에 입력해 주세요. 직접 요청하지 않았다면 이 메일을 무시하세요.`,
    });
    return {};
  }
  if (env.DEV_MAIL_LOG === "1") {
    console.log(`[개발용] ${to} 인증 코드: ${code}`);
    return { devCode: code };
  }
  throw new Error("메일 발송 설정(EMAIL, MAIL_FROM)이 없습니다.");
}
