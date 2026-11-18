import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.ts";

let server: Server;
let base = "";
let dir = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ttamok-"));
  const app = createApp({ dataDir: dir });
  server = createServer((req, res) => void app.handle(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

// 흑 5목: 흑 (7,3..7), 백 (0,0..3)
const BLACK_FIVE = [
  [7, 3], [0, 0], [7, 4], [0, 1], [7, 5], [0, 2], [7, 6], [0, 3], [7, 7],
].map(([row, col]) => ({ row, col }));

describe("계정·랭크 대국 API", () => {
  let a = "", b = "";

  it("아이디·비밀번호로 가입하면 500점 18급으로 시작한다", async () => {
    const r = await api("/api/signup", { username: "흑돌왕", password: "secret1" });
    expect(r.status).toBe(200);
    expect(r.data.user).toMatchObject({ username: "흑돌왕", rating: 500, rank: "18급", games: 0 });
    expect(r.data.user.mmr).toBeUndefined(); // 실력 점수는 공개하지 않는다
    a = r.data.token;
    b = (await api("/api/signup", { username: "white_1", password: "secret2" })).data.token;
  });

  it("중복 아이디·짧은 비밀번호·잘못된 아이디는 거부", async () => {
    expect((await api("/api/signup", { username: "WHITE_1", password: "secret2" })).status).toBe(409);
    expect((await api("/api/signup", { username: "newbie", password: "123" })).status).toBe(400);
    expect((await api("/api/signup", { username: "a b", password: "secret3" })).status).toBe(400);
  });

  it("로그인·내 정보", async () => {
    expect((await api("/api/login", { username: "white_1", password: "wrong!!" })).status).toBe(401);
    const r = await api("/api/login", { username: "White_1", password: "secret2" });
    expect(r.status).toBe(200);
    expect((await api("/api/me", undefined, r.data.token)).data.user.username).toBe("white_1");
    expect((await api("/api/me", undefined, "x".repeat(43))).status).toBe(401);
  });

  it("랭크 대국: 서버가 기보를 다시 둬서 승패를 확인하고 점수를 한 번만 반영한다", async () => {
    expect((await api("/api/rated-games", { blackToken: a, whiteToken: a })).status).toBe(400);
    const g = await api("/api/rated-games", { blackToken: a, whiteToken: b });
    expect(g.status).toBe(200);
    const id = g.data.gameId;

    // 끝나지 않은 기보 / 규칙 위반 기보는 거부
    expect((await api(`/api/rated-games/${id}/result`, { moves: BLACK_FIVE.slice(0, 8) }, a)).data.error).toBe("not_finished");
    expect((await api(`/api/rated-games/${id}/result`, { moves: [BLACK_FIVE[0], BLACK_FIVE[0]] }, a)).data.error).toBe("illegal_move");

    const r = await api(`/api/rated-games/${id}/result`, { moves: BLACK_FIVE }, b);
    expect(r.status).toBe(200);
    expect(r.data.winner).toBe("black");
    expect(r.data.winReason).toBe("five");
    expect(r.data.black.after).toBeGreaterThan(500);
    expect(r.data.black.bonus).toBeGreaterThan(0);
    expect(r.data.white.after).toBe(500); // 1000점 미만은 져도 표시 점수를 잃지 않음

    expect((await api(`/api/rated-games/${id}/result`, { moves: BLACK_FIVE }, a)).status).toBe(409);

    const board = await api("/api/leaderboard");
    expect(board.data.players[0].username).toBe("흑돌왕");
    const stats = await api("/api/stats");
    expect(stats.data.players).toBe(2);
  });

  it("참가자가 아니면 결과를 낼 수 없다", async () => {
    const c = (await api("/api/signup", { username: "구경꾼", password: "secret4" })).data.token;
    const g = await api("/api/rated-games", { blackToken: a, whiteToken: b });
    expect((await api(`/api/rated-games/${g.data.gameId}/result`, { moves: BLACK_FIVE }, c)).status).toBe(403);
  });

  it("로그인 시도는 분당 10회로 제한된다", async () => {
    let limited = false;
    for (let i = 0; i < 12; i++) {
      if ((await api("/api/login", { username: "nobody", password: "whatever" })).status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});
