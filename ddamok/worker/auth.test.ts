import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, newToken, TOKEN_RE, verifyPassword } from "./auth.ts";

describe("비밀번호·토큰", () => {
  it("PBKDF2 해시: 맞는 비밀번호만 통과, 같은 비밀번호도 해시는 매번 다르다", async () => {
    const h = await hashPassword("password1", 1000);
    expect(h).toMatch(/^pbkdf2\$1000\$/);
    expect(await verifyPassword("password1", h)).toBe(true);
    expect(await verifyPassword("password2", h)).toBe(false);
    expect(await hashPassword("password1", 1000)).not.toBe(h);
    expect(await verifyPassword("x", "!")).toBe(false); // AI 계정 등 로그인 불가 해시
  });

  it("세션 토큰은 무작위·URL 안전, 저장은 해시만", async () => {
    const t = newToken();
    expect(TOKEN_RE.test(t)).toBe(true);
    expect(newToken()).not.toBe(t);
    expect(await hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});
