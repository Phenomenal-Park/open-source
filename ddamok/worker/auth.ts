// 비밀번호 해시(PBKDF2-SHA256, WebCrypto)와 세션 토큰. Workers와 Node 모두에서 돈다.
const enc = new TextEncoder();

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(await derive(password, salt, iterations))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltB64, hashB64] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || !saltB64 || !hashB64) return false;
  const expected = unb64(hashB64);
  const actual = await derive(password, unb64(saltB64), iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export function newToken(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 세션 토큰은 해시만 저장한다. */
export async function hashToken(token: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(token)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** 닉네임: 영문·숫자·_ · 한글 · 일본어(히라가나·가타카나·한자) 2~16자 */
export const USERNAME_RE = /^[A-Za-z0-9_가-힣ぁ-ゖァ-ヺー一-龯]{2,16}$/u;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
