// Cloudflare Worker 통합 테스트: 로컬 wrangler dev(실제 workerd + 로컬 D1 + Durable Objects)를 띄워
// 가입·이메일 인증·레이팅/친선/친구 매치·착수 검증·기권·연결 끊김·AI 대체·기보 보관 한도를 확인한다.
// 사용: npm run build && node tests/worker.mjs
import assert from "node:assert/strict";
import { startServer } from "./serve.mjs";

const server = await startServer({ DISCONNECT_MS: "3000", RECORDS_LIMIT: "2" });
const { base, port } = server;

let failures = 0;
async function check(name, fn, ms = 40000) {
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`check timeout ${ms}ms`)), ms))]);
    console.log(`✓ ${name}`);
  } catch (e) { failures++; console.log(`✗ ${name}\n  ${e.stack?.split("\n").slice(0, 3).join("\n  ")}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 요청 제한(IP별)은 실제로 동작하므로, 테스트 요청마다 다른 IP로 보이게 한다(로컬에서만 가능 — 실서비스는 Cloudflare가 덮어씀)
let ipSeq = 1;
async function api(path, body, token) {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.0.0.${ipSeq++ % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

/** WebSocket을 열고 메시지를 큐로 받는다 */
function socket(path, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, ["ttamok", token]);
  const queue = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    queue.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  // 연결 자체를 거부당하면(403 등) close 없이 error만 오는 경우가 있다
  const closed = new Promise((r) => {
    ws.addEventListener("close", (e) => r(e));
    ws.addEventListener("error", () => r({ code: -1 }));
  });
  return {
    ws, closed, queue,
    next(pred = () => true, ms = 20000) {
      const hit = queue.find(pred);
      if (hit) { queue.splice(queue.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const w = { pred, resolve: (m) => { queue.splice(queue.indexOf(m), 1); clearTimeout(t); resolve(m); } };
        const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`timeout; got ${JSON.stringify(queue.slice(-3))}`)); }, ms);
        waiters.push(w);
      });
    },
    send: (m) => ws.send(JSON.stringify(m)),
    close: () => ws.close(),
  };
}

async function signup(name) {
  const r = await api("/api/signup", { username: name, email: `${name}@example.com`, password: "password1", over14: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.verified, false);
  assert.match(r.data.devCode, /^\d{6}$/);
  return r.data;
}

async function match(token, q) {
  const s = socket(`/api/match?${q}`, token);
  return s;
}

/** 두 사람을 매칭시키고 대국방에 접속 → { gameId, black, white } (각각 { token, sock }) */
async function pairUp(a, b, q) {
  const ma = await match(a, q);
  await ma.next((m) => m.type === "waiting");
  const mb = await match(b, q);
  const [x, y] = await Promise.all([ma.next((m) => m.type === "matched"), mb.next((m) => m.type === "matched")]);
  assert.equal(x.gameId, y.gameId);
  const ga = socket(`/api/games/${x.gameId}/ws`, a), gb = socket(`/api/games/${x.gameId}/ws`, b);
  const sa = await ga.next((m) => m.type === "state"), sb = await gb.next((m) => m.type === "state");
  assert.notEqual(sa.you, sb.you);
  const black = sa.you === "black" ? { token: a, sock: ga } : { token: b, sock: gb };
  const white = sa.you === "black" ? { token: b, sock: gb } : { token: a, sock: ga };
  return { gameId: x.gameId, black, white, game: sa.game };
}

async function play(p, row, col, moveNo) {
  p.sock.send({ type: "move", row, col, moveNo });
  return p.sock.next((m) => m.type === "state" && m.game.moves.length === moveNo + 1);
}

const A = {}, B = {};

await check("가입: 닉네임·이메일·비밀번호(+만 14세) → 인증 코드, 인증 전에는 온라인 대국 불가", async () => {
  const a = await signup("흑돌왕");
  const b = await signup("white_1");
  A.token = a.token; B.token = b.token;
  assert.equal((await api("/api/signup", { username: "WHITE_1", email: "x@example.com", password: "password1", over14: true })).status, 409);
  assert.equal((await api("/api/signup", { username: "newbie", email: "white_1@example.com", password: "password1", over14: true })).status, 409);
  assert.equal((await api("/api/signup", { username: "kid", email: "kid@example.com", password: "password1" })).status, 400);
  assert.equal((await api("/api/signup", { username: "bad", email: "not-an-email", password: "password1", over14: true })).status, 400);
  // 인증 전 매칭 시도 → 연결 거부
  const s = socket("/api/match?mode=rated", A.token);
  const ev = await s.closed;
  assert.notEqual(ev.code, 1000);
  // 틀린 코드 → 거부, 맞는 코드 → 인증
  assert.equal((await api("/api/verify", { code: "000000" === a.devCode ? "111111" : "000000" }, A.token)).status, 400);
  assert.equal((await api("/api/verify", { code: a.devCode }, A.token)).data.verified, true);
  assert.equal((await api("/api/verify", { code: b.devCode }, B.token)).data.verified, true);
  const me = await api("/api/me", undefined, A.token);
  assert.equal(me.data.verified, true);
  assert.equal(me.data.user.provisional, true);
  assert.equal(me.data.user.rating, 500);
  assert.equal(me.data.settings.allowAi, true);
});

await check("요청 제한: 같은 IP에서 가입은 분당 3회까지", async () => {
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(base + "/api/signup", {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "10.9.9.9" },
      body: JSON.stringify({ username: `rl${i}`, email: `rl${i}@example.com`, password: "password1", over14: true }),
    });
    codes.push(r.status);
  }
  assert.deepEqual(codes, [200, 200, 200, 429]);
});

await check("로그인: 이메일 또는 닉네임", async () => {
  assert.equal((await api("/api/login", { login: "WHITE_1@example.com", password: "password1" })).status, 200);
  assert.equal((await api("/api/login", { login: "흑돌왕", password: "password1" })).status, 200);
  assert.equal((await api("/api/login", { login: "흑돌왕", password: "nope!!" })).status, 401);
});

let ratedGameId = "";
await check("레이팅매치: 매칭 → 서버가 착수 검증 → 5목 승리 → 점수 반영(?)", async () => {
  const { gameId, black, white, game } = await pairUp(A.token, B.token, "mode=rated");
  ratedGameId = gameId;
  assert.equal(game.rated, true);
  assert.equal(game.players.black.provisional, true);
  // 백이 먼저 두려 하면 거부
  white.sock.send({ type: "move", row: 0, col: 0, moveNo: 0 });
  const err = await white.sock.next((m) => m.type === "error");
  assert.match(err.message, /상대 차례/);
  let n = 0;
  for (let i = 0; i < 4; i++) {
    await play(black, 7, 3 + i, n++);
    // 같은 자리 두기 거부
    if (i === 0) { white.sock.send({ type: "move", row: 7, col: 3, moveNo: n }); await white.sock.next((m) => m.type === "error"); }
    await play(white, 0, i, n++);
  }
  const fin = await play(black, 7, 7, n++);
  assert.equal(fin.game.status, "finished");
  assert.equal(fin.game.result.winner, "black");
  assert.equal(fin.game.result.reason, "five");
  const r = fin.game.result.ratings;
  assert.ok(r.black.after > r.black.before, JSON.stringify(r));
  assert.equal(r.white.after, 500); // 1000점 미만은 져도 표시 점수를 잃지 않음
  assert.equal(r.black.provisional, true);
  black.sock.close(); white.sock.close();
  const board = await api("/api/leaderboard");
  assert.equal(board.data.players.length, 2);
  assert.ok(!board.data.players.some((p) => p.bot));
  assert.equal((await api("/api/me", undefined, A.token)).data.activeGame, null);
});

await check("기보: 닉네임으로 검색, 한 판 수순 보기", async () => {
  const r = await api("/api/records?user=" + encodeURIComponent("흑돌왕"));
  assert.equal(r.status, 200);
  assert.equal(r.data.games.length, 1);
  assert.equal(r.data.games[0].opponent, "white_1");
  const g = await api(`/api/games/${ratedGameId}`);
  assert.equal(g.data.moves.length, 9);
  assert.equal(g.data.reason, "five");
  assert.equal((await api("/api/records?user=nobody")).status, 404);
});

await check("친선매치: 점수 미반영, 기권", async () => {
  const before = (await api("/api/me", undefined, A.token)).data.user;
  const { black, white, game } = await pairUp(A.token, B.token, "mode=casual");
  assert.equal(game.rated, false);
  black.sock.send({ type: "resign" });
  const fin = await white.sock.next((m) => m.type === "state" && m.game.status === "finished");
  assert.equal(fin.game.result.winner, "white");
  assert.equal(fin.game.result.reason, "resign");
  assert.equal(fin.game.result.ratings, undefined);
  black.sock.close(); white.sock.close();
  const after = (await api("/api/me", undefined, A.token)).data.user;
  assert.equal(after.rating, before.rating);
  assert.equal(after.games, before.games);
});

await check("친구매치: 같은 코드끼리, 숫자 1~8자리만", async () => {
  for (const bad of ["12a4", "123456789", ""]) {
    const s = socket(`/api/match?mode=friend&code=${bad}`, A.token);
    const ev = await s.closed;
    assert.notEqual(ev.code, 1000, bad);
  }
  // 다른 코드끼리는 안 붙는다
  const x = await match(A.token, "mode=friend&code=1111");
  await x.next((m) => m.type === "waiting");
  const y = await match(B.token, "mode=friend&code=2222");
  await y.next((m) => m.type === "waiting");
  await sleep(500);
  assert.ok(!x.queue.some((m) => m.type === "matched"));
  x.close(); y.close();
  await sleep(300);
});

await check("연결 끊김: 돌아오지 않으면(테스트 3초, 실제 45초) 끊긴 쪽 패배", async () => {
  const { black, white } = await pairUp(A.token, B.token, "mode=friend&code=12345678");
  await play(black, 7, 7, 0);
  white.sock.close();
  const warn = await black.sock.next((m) => m.type === "state" && m.game.disconnected.white !== undefined);
  assert.ok(warn.game.disconnected.white <= 3000);
  const fin = await black.sock.next((m) => m.type === "state" && m.game.status === "finished", 10000);
  assert.equal(fin.game.result.winner, "black");
  assert.equal(fin.game.result.reason, "disconnect");
  black.sock.close();
});

await check("끊겼다가 시간 안에 돌아오면 계속 둔다 / 진행 중 대국이 있으면 매칭 대신 그 대국으로", async () => {
  const { gameId, black, white } = await pairUp(A.token, B.token, "mode=casual");
  white.sock.close();
  await black.sock.next((m) => m.type === "state" && m.game.disconnected.white !== undefined);
  const again = socket(`/api/match?mode=rated`, white.token); // 다시 매칭을 눌러도
  const m = await again.next((x) => x.type === "matched");
  assert.equal(m.gameId, gameId);                                 // 진행 중인 대국으로 안내
  const back = socket(`/api/games/${gameId}/ws`, white.token);
  const st = await back.next((x) => x.type === "state");
  assert.equal(st.game.status, "playing");
  await black.sock.next((x) => x.type === "state" && x.game.disconnected.white === undefined);
  await sleep(3500);
  black.sock.send({ type: "resign" });
  const fin = await back.next((x) => x.type === "state" && x.game.status === "finished");
  assert.equal(fin.game.result.reason, "resign");
  black.sock.close(); back.close();
});

await check("기보 보관 한도(테스트 2판): 오래된 기보는 지워져도 점수·전적은 그대로", async () => {
  const r = await api("/api/records?user=" + encodeURIComponent("흑돌왕"));
  assert.equal(r.data.games.length, 2);
  assert.equal((await api(`/api/games/${ratedGameId}`)).status, 404); // 첫 대국 기보는 지워짐
  const me = (await api("/api/me", undefined, A.token)).data.user;
  assert.equal(me.games, 1);   // 레이팅매치 1판은 그대로
  assert.ok(me.rating > 500 || me.wins + me.losses === 1);
});

await check("레이팅매치에서 사람이 없으면 15초 뒤 가장 가까운 AI(허용 시), AI는 서버가 둔다", async () => {
  const s = await match(A.token, "mode=rated");
  await s.next((m) => m.type === "waiting");
  const m = await s.next((x) => x.type === "matched", 25000);
  const g = socket(`/api/games/${m.gameId}/ws`, A.token);
  let st = await g.next((x) => x.type === "state");
  const ai = st.you === "black" ? "white" : "black";
  assert.equal(st.game.players[ai].bot, true);
  assert.match(st.game.players[ai].username, /^AI /);
  if (st.you === "white") st = await g.next((x) => x.type === "state" && x.game.moves.length === 1, 5000);
  else { g.send({ type: "move", row: 7, col: 7, moveNo: 0 }); st = await g.next((x) => x.type === "state" && x.game.moves.length === 2, 5000); }
  g.send({ type: "resign" });
  const fin = await g.next((x) => x.type === "state" && x.game.status === "finished");
  assert.ok(fin.game.result.ratings, "AI 대국도 레이팅 반영");
  g.close();
});

await check("AI 상대 허용을 끄면 AI와 붙지 않는다", async () => {
  assert.equal((await api("/api/settings", { allowAi: false }, B.token)).data.settings.allowAi, false);
  const s = await match(B.token, "mode=rated");
  await s.next((m) => m.type === "waiting");
  await sleep(17000);
  assert.ok(!s.queue.some((m) => m.type === "matched"));
  s.close();
});

if (failures) console.log(server.log().split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-15).join("\n"));
server.stop();
console.log(failures ? `${failures}개 실패` : "모두 통과");
process.exit(failures ? 1 : 0);
