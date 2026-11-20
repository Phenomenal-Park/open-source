// Cloudflare Worker 통합 테스트: 로컬 wrangler dev(실제 workerd + 로컬 D1 + Durable Objects)를 띄워
// 가입·이메일 인증·레이팅/친선/친구 매치·착수 검증·기권·연결 끊김·AI 대체·기보 보관 한도를 확인한다.
// 사용: npm run build && node tests/worker.mjs
import assert from "node:assert/strict";
import { startServer } from "./serve.mjs";

const server = await startServer({ DISCONNECT_MS: "3000", RECORDS_LIMIT: "2", HEARTBEAT_TIMEOUT_MS: "3000" });
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

/** WebSocket을 열고 메시지를 큐로 받는다. 브라우저처럼 신호(ping)를 보낸다(noPing이면 조용히 끊긴 연결 흉내). */
function socket(path, token, { noPing = false } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, ["ddamok", token]);
  const beat = noPing ? null : setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 1000);
  ws.addEventListener("close", () => beat && clearInterval(beat));
  const queue = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "pong") return;
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
    close: () => { if (beat) clearInterval(beat); ws.close(); },
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
/** 첫 레이팅매치에서 진 쪽(흑백은 무작위라 누군지 기록해 둔다) */
const LOSER = { token: "", name: "" };
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
    if (i === 0) {
      // 흑의 첫 수는 천원만
      black.sock.send({ type: "move", row: 3, col: 3, moveNo: 0 });
      assert.equal((await black.sock.next((m) => m.type === "error")).code, "illegal");
    }
    await play(black, 7, 7 + i, n++);
    // 같은 자리 두기 거부
    if (i === 0) { white.sock.send({ type: "move", row: 7, col: 7, moveNo: n }); await white.sock.next((m) => m.type === "error"); }
    await play(white, 0, i, n++);
  }
  const fin = await play(black, 7, 11, n++);
  assert.equal(fin.game.status, "finished");
  assert.equal(fin.game.result.winner, "black");
  assert.equal(fin.game.result.reason, "five");
  const r = fin.game.result.ratings;
  assert.ok(r.black.after > r.black.before, JSON.stringify(r));
  assert.equal(r.white.after, 500); // 1000점 미만은 져도 표시 점수를 잃지 않음
  assert.equal(r.black.provisional, true);
  black.sock.close(); white.sock.close();
  // 진 쪽(백)도 명승부로 박제할 수 있다
  LOSER.token = white.token;
  LOSER.name = white.token === A.token ? "흑돌왕" : "white_1";
  const fav = await api("/api/favorites", { gameId, on: true }, white.token);
  assert.equal(fav.status, 200, JSON.stringify(fav.data));
  assert.equal(fav.data.count, 1);
  const board = await api("/api/leaderboard");
  assert.equal(board.data.players.length, 2);
  assert.ok(!board.data.players.some((p) => p.bot));
  assert.equal((await api("/api/me", undefined, A.token)).data.activeGame, null);
});

await check("기보: 닉네임으로 검색, 한 판 수순 보기", async () => {
  const r = await api("/api/records?user=" + encodeURIComponent("흑돌왕"));
  assert.equal(r.status, 200);
  assert.equal(r.data.games.length, 1);
  const s0 = r.data.games[0];
  assert.equal(s0.opponent, "white_1");
  assert.equal(s0.opponentRating, 500);          // 대국 당시 상대 점수
  assert.equal(s0.opponentProvisional, true);
  assert.equal(s0.result, s0.color === "black" ? "win" : "loss"); // 첫 대국은 흑이 5목으로 이겼다
  assert.equal(s0.moveCount, 9);
  assert.equal(s0.moves, undefined);              // 목록에는 착수 데이터를 싣지 않는다
  const me = (await api("/api/me", undefined, A.token)).data.user;
  assert.equal(me.maxRating, me.rating);          // 최고 점수
  assert.equal(me.draws, 0);
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

await check("백 히든: 흑에게는 숨은 돌이 보이지 않고(좌표도 안 옴), 흑이 그 자리를 누르면 드러나고 흑 차례 유지, 한 판에 한 번", async () => {
  const { black, white, game } = await pairUp(A.token, B.token, "mode=friend&code=4321");
  assert.equal(game.hiddenMove, true, "친구매치는 기본 히든 모드");
  assert.deepEqual(game.view.config.captureTarget, { black: 10, white: 10 });
  await play(black, 7, 7, 0);
  await white.sock.next((m) => m.type === "state" && m.game.moves.length === 1);
  white.sock.send({ type: "hidden" });
  const armedB = await black.sock.next((m) => m.type === "state" && m.game.hiddenArmedMs !== undefined);
  assert.ok(armedB.game.hiddenArmedMs > 8000 && armedB.game.hiddenArmedMs <= 10000);
  // 숨겨 두기
  white.sock.send({ type: "move", row: 7, col: 8, moveNo: 1, hidden: true });
  const w = await white.sock.next((m) => m.type === "state" && m.game.moves.length === 2);
  const b = await black.sock.next((m) => m.type === "state" && m.game.moves.length === 2);
  assert.deepEqual(w.game.view.hidden, { index: 1, pos: { row: 7, col: 8 }, revealed: false });
  assert.equal(w.game.view.board[7][8], "white");
  assert.equal(b.game.view.board[7][8], null);
  assert.deepEqual(b.game.moves[1], { row: -1, col: -1 });
  assert.ok(!JSON.stringify(b).includes('"row":7,"col":8'), "흑에게 가는 메시지에 숨은 좌표가 없어야 한다");
  assert.equal(b.game.hiddenArmedMs, undefined);
  // 흑이 그 자리를 누름 → 드러나고 흑 차례 그대로(수는 늘지 않음)
  black.sock.send({ type: "move", row: 7, col: 8, moveNo: 2 });
  const r = await black.sock.next((m) => m.type === "state" && m.game.view.hidden?.revealed === true);
  assert.equal(r.game.moves.length, 2);
  assert.equal(r.game.view.currentPlayer, "black");
  assert.equal(r.game.view.board[7][8], "white");
  await play(black, 6, 6, 2);
  // 두 번째 히든은 받지 않는다
  await white.sock.next((m) => m.type === "state" && m.game.moves.length === 3);
  white.sock.send({ type: "hidden" });
  await sleep(500);
  assert.ok(!black.sock.queue.some((m) => m.type === "state" && m.game.hiddenArmedMs !== undefined));
  black.sock.send({ type: "resign" });
  await white.sock.next((m) => m.type === "state" && m.game.status === "finished");
  black.sock.close(); white.sock.close();
  const rec = (await api(`/api/games/${b.game.id}`)).data;
  assert.equal(rec.hiddenMove, true);
  assert.equal(rec.hiddenIndex, 1);
  assert.deepEqual(rec.moves[1], { row: 7, col: 8 });
});

await check("백 히든: 누르고 10초(+여유) 안에 두지 않으면 그 판의 히든 기회가 사라지고 백 차례 그대로", async () => {
  const { black, white } = await pairUp(A.token, B.token, "mode=friend&code=4322");
  await play(black, 7, 7, 0);
  await white.sock.next((m) => m.type === "state" && m.game.moves.length === 1);
  white.sock.send({ type: "hidden" });
  await white.sock.next((m) => m.type === "state" && m.game.hiddenArmedMs !== undefined);
  // 히든을 누른 뒤에는 보이게 두는 수를 받지 않는다
  white.sock.send({ type: "move", row: 6, col: 6, moveNo: 1 });
  const err = await white.sock.next((m) => m.type === "error");
  assert.equal(err.code, "hidden_required");
  const lost = await white.sock.next((m) => m.type === "state" && m.game.hiddenArmedMs === undefined && m.game.view.hidden?.index === -1, 16000);
  assert.equal(lost.game.view.currentPlayer, "white");
  await play(white, 6, 6, 1);
  black.sock.send({ type: "resign" });
  await white.sock.next((m) => m.type === "state" && m.game.status === "finished");
  black.sock.close(); white.sock.close();
}, 40000);

await check("친구매치 노히든: 같은 코드라도 히든 설정이 다르면 안 붙고, 노히든끼리는 히든 없이 흑 12 / 백 10", async () => {
  const x = await match(A.token, "mode=friend&code=5555&hidden=0");
  await x.next((m) => m.type === "waiting");
  const y = await match(B.token, "mode=friend&code=5555&hidden=1");
  await y.next((m) => m.type === "waiting");
  await sleep(500);
  assert.ok(!x.queue.some((m) => m.type === "matched"));
  x.close(); y.close();
  await sleep(300);
  const { black, white, game } = await pairUp(A.token, B.token, "mode=friend&code=5556&hidden=0");
  assert.equal(game.hiddenMove, false);
  assert.deepEqual(game.view.config.captureTarget, { black: 12, white: 10 });
  await play(black, 7, 7, 0);
  await white.sock.next((m) => m.type === "state" && m.game.moves.length === 1);
  white.sock.send({ type: "hidden" });
  await sleep(500);
  assert.ok(!black.sock.queue.some((m) => m.type === "state" && m.game.hiddenArmedMs !== undefined), "노히든 판에서는 히든을 받지 않는다");
  black.sock.send({ type: "resign" });
  await white.sock.next((m) => m.type === "state" && m.game.status === "finished");
  black.sock.close(); white.sock.close();
  assert.equal((await api(`/api/games/${game.id}`)).data.hiddenMove, false);
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

await check("조용히 끊긴 연결(신호 없음)도 알아채고, 그때부터 접속 끊김 시간을 센다", async () => {
  const ma = await match(A.token, "mode=friend&code=777");
  await ma.next((m) => m.type === "waiting");
  const mb = await match(B.token, "mode=friend&code=777");
  const { gameId } = await ma.next((m) => m.type === "matched");
  await mb.next((m) => m.type === "matched");
  const ga = socket(`/api/games/${gameId}/ws`, A.token);
  const gb = socket(`/api/games/${gameId}/ws`, B.token, { noPing: true }); // 닫지도 않고 신호도 안 보냄
  await ga.next((m) => m.type === "state");
  await gb.next((m) => m.type === "state");
  const t0 = Date.now();
  const st = await ga.next((m) => m.type === "state" && Object.keys(m.game.disconnected).length > 0, 15000);
  const silent = Object.keys(st.game.disconnected)[0];
  assert.equal(st.game.players[silent].username, "white_1");
  assert.ok(Date.now() - t0 >= 2000, "신호 확인 시간(테스트 3초) 전에는 끊김으로 보지 않음");
  const fin = await ga.next((m) => m.type === "state" && m.game.status === "finished", 10000);
  assert.equal(fin.game.result.reason, "disconnect");
  assert.equal(fin.game.players[fin.game.result.winner].username, "흑돌왕");
  ga.close(); gb.close();
});

await check("매칭 대기 중 조용히 끊긴 사람과는 매칭하지 않는다", async () => {
  const ghost = socket("/api/match?mode=casual", A.token, { noPing: true });
  await ghost.next((m) => m.type === "waiting");
  await sleep(4000); // 신호 확인 시간(테스트 3초) 초과
  const b = await match(B.token, "mode=casual");
  await b.next((m) => m.type === "waiting");
  await sleep(500);
  assert.ok(!b.queue.some((m) => m.type === "matched"));
  ghost.close(); b.close();
  await sleep(300);
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

await check("기보 보관 한도(테스트 2판): 오래된 기보는 정리, 명승부로 박제한 기보는 평생 보관, 점수·전적은 그대로", async () => {
  const r = await api("/api/records?user=" + encodeURIComponent("흑돌왕"));
  assert.equal(r.data.games.length, 2);
  assert.equal(r.data.total, 2);
  assert.ok(!r.data.games.some((g) => g.id === ratedGameId));            // 최근 목록에서는 빠졌지만
  const kept = await api(`/api/games/${ratedGameId}`);
  assert.equal(kept.status, 200);                                          // 백이 박제했으므로 기보는 남아 있다
  assert.equal(kept.data.players.white.rating, 500);
  const wb = await api("/api/records?user=" + encodeURIComponent(LOSER.name));
  assert.ok(wb.data.favorites.some((g) => g.id === ratedGameId && g.result === "loss"), "진 판도 명승부로 남아 있다");
  const me = (await api("/api/me", undefined, A.token)).data.user;
  assert.equal(me.games, 1);   // 레이팅매치 1판은 그대로
  assert.equal(me.wins + me.losses, 1);
  // 박제를 해제하면 어디에도 필요 없는 기보가 되어 정리된다(점수·전적은 그대로)
  await api("/api/favorites", { gameId: ratedGameId, on: false }, LOSER.token);
  assert.equal((await api(`/api/games/${ratedGameId}`)).status, 404);
  const after = (await api("/api/me", undefined, A.token)).data.user;
  assert.deepEqual([after.games, after.wins, after.losses], [me.games, me.wins, me.losses]);
});

await check("명승부: 1인 3판까지, 내가 둔 대국만", async () => {
  const mine = (await api("/api/records?user=white_1")).data.games.map((g) => g.id);
  assert.ok(mine.length >= 2);
  const other = (await api("/api/records?user=" + encodeURIComponent("흑돌왕"))).data.games[0].id;
  for (const id of mine.slice(0, 2)) assert.equal((await api("/api/favorites", { gameId: id, on: true }, B.token)).status, 200);
  const c = await signup("outsider");
  await api("/api/verify", { code: c.devCode }, c.token);
  assert.equal((await api("/api/favorites", { gameId: mine[0], on: true }, c.token)).status, 403); // 남의 대국
  // 같은 판을 다시 눌러도 한도를 쓰지 않는다
  assert.equal((await api("/api/favorites", { gameId: mine[0], on: true }, B.token)).data.count, 2);
  const third = other !== mine[0] && other !== mine[1] ? other : null;
  const pool = [...new Set([...mine, ...(third ? [third] : [])])];
  const ids = (await api("/api/records?user=white_1")).data.games.map((g) => g.id);
  // 3판째까지 성공, 4판째는 거절(기보가 모자라면 가능한 만큼만 확인)
  const extra = ids.filter((id) => !mine.slice(0, 2).includes(id));
  if (extra.length) {
    assert.equal((await api("/api/favorites", { gameId: extra[0], on: true }, B.token)).data.count, 3);
    const fourth = (await api("/api/records?user=white_1")).data.games.map((g) => g.id).find((id) => ![...mine.slice(0, 2), extra[0]].includes(id));
    if (fourth) {
      const full = await api("/api/favorites", { gameId: fourth, on: true }, B.token);
      assert.equal(full.status, 409);
      assert.equal(full.data.error, "fav_full");
    }
  }
  void pool;
  const list = (await api("/api/records?user=white_1")).data;
  assert.ok(list.favorites.length <= 3);
  assert.equal(list.favoritesMax, 3);
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
  assert.doesNotMatch(st.game.players[ai].username, /급|단/);
  if (st.you === "white") st = await g.next((x) => x.type === "state" && x.game.moves.length === 1, 5000);
  else { g.send({ type: "move", row: 7, col: 7, moveNo: 0 }); st = await g.next((x) => x.type === "state" && x.game.moves.length === 2, 5000); }
  g.send({ type: "resign" });
  const fin = await g.next((x) => x.type === "state" && x.game.status === "finished");
  assert.ok(fin.game.result.ratings, "AI 대국도 레이팅 반영");
  g.close();
});

await check("대국 중인 AI는 다른 사람과 매칭되지 않는다", async () => {
  const c = await signup("third_c");
  await api("/api/verify", { code: c.devCode }, c.token);
  const busyName = await (async () => {
    const s = await match(A.token, "mode=rated");
    const m = await s.next((x) => x.type === "matched", 25000);
    const g = socket(`/api/games/${m.gameId}/ws`, A.token);
    const st = await g.next((x) => x.type === "state");
    A.aiGame = g;
    return st.game.players[st.you === "black" ? "white" : "black"].username;
  })();
  const bots = (await api("/api/bots")).data.bots;
  assert.equal(bots.find((b) => b.username === busyName).busy, true);
  assert.ok(bots.every((b) => !/급|단/.test(b.username)), "AI 이름에 급수 없음");
  const s = await match(c.token, "mode=rated");
  const m = await s.next((x) => x.type === "matched", 25000);
  const g = socket(`/api/games/${m.gameId}/ws`, c.token);
  const st = await g.next((x) => x.type === "state");
  const other = st.game.players[st.you === "black" ? "white" : "black"].username;
  assert.notEqual(other, busyName);
  assert.equal(st.game.players[st.you === "black" ? "white" : "black"].bot, true);
  for (const x of [A.aiGame, g]) { x.send({ type: "resign" }); await x.next((y) => y.type === "state" && y.game.status === "finished"); x.close(); }
  assert.equal((await api("/api/bots")).data.bots.find((b) => b.username === busyName).busy, false); // 끝나면 다시 비어 있음
}, 70000);

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

// ── 무승부: 5×5 판 전용 서버(판이 다 차는 대국을 짧게 재현) ──
const DRAW_SEQ = [[2,2],[1,1],[4,3],[2,4],[4,2],[2,0],[0,3],[3,2],[0,4],[4,4],[0,1],[1,3],[1,4],[3,0],[3,1],[3,3],[0,2],[3,4],[2,3],[1,2],[2,1],[0,0],[4,0],[1,0],[4,1]]; // 첫 수는 천원(2,2)
const small = await startServer({ BOARD_SIZE: "5" });
const sapi = async (path, body, token) => {
  const res = await fetch(small.base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.1.0.${ipSeq++ % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};
const ssock = (path, token) => {
  const ws = new WebSocket(`ws://127.0.0.1:${small.port}${path}`, ["ddamok", token]);
  const q = []; const waiters = [];
  const beat = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 1000);
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === "pong") return; q.push(m); for (const w of [...waiters]) if (w.p(m)) { waiters.splice(waiters.indexOf(w), 1); q.splice(q.indexOf(m), 1); w.r(m); } });
  return {
    send: (m) => ws.send(JSON.stringify(m)), close: () => { clearInterval(beat); ws.close(); },
    next: (p) => { const h = q.find(p); if (h) { q.splice(q.indexOf(h), 1); return Promise.resolve(h); } return new Promise((r, rej) => { waiters.push({ p, r }); setTimeout(() => rej(new Error("timeout")), 20000); }); },
  };
};
await check("무승부: 판이 다 차면 무승부, 통산 전적에 무승부 1, 기보에 무승부", async () => {
  const users = [];
  for (const n of ["draw_a", "draw_b"]) {
    const r = await sapi("/api/signup", { username: n, email: `${n}@example.com`, password: "password1", over14: true });
    await sapi("/api/verify", { code: r.data.devCode }, r.data.token);
    users.push(r.data.token);
  }
  const ma = ssock("/api/match?mode=rated", users[0]);
  await ma.next((m) => m.type === "waiting");
  const mb = ssock("/api/match?mode=rated", users[1]);
  const { gameId } = await ma.next((m) => m.type === "matched");
  await mb.next((m) => m.type === "matched");
  const ga = ssock(`/api/games/${gameId}/ws`, users[0]), gb = ssock(`/api/games/${gameId}/ws`, users[1]);
  const sa = await ga.next((m) => m.type === "state");
  await gb.next((m) => m.type === "state");
  assert.equal(sa.game.boardSize, 5);
  const byColor = sa.you === "black" ? { black: ga, white: gb } : { black: gb, white: ga };
  let fin;
  for (let i = 0; i < DRAW_SEQ.length; i++) {
    const p = byColor[i % 2 === 0 ? "black" : "white"];
    p.send({ type: "move", row: DRAW_SEQ[i][0], col: DRAW_SEQ[i][1], moveNo: i });
    fin = await p.next((m) => m.type === "state" && m.game.moves.length === i + 1);
  }
  assert.equal(fin.game.status, "finished");
  assert.equal(fin.game.result.winner, null);
  assert.equal(fin.game.result.reason, "draw");
  assert.ok(fin.game.result.ratings, "레이팅매치 무승부도 점수 반영(0.5승)");
  ga.close(); gb.close();
  const me = (await sapi("/api/me", undefined, users[0])).data.user;
  assert.deepEqual([me.wins, me.losses, me.draws, me.games], [0, 0, 1, 1]);
  const rec = (await sapi("/api/records?user=draw_a")).data.games[0];
  assert.equal(rec.result, "draw");
  assert.equal(rec.moveCount, 25);
  assert.equal((await sapi(`/api/games/${gameId}`)).data.winner, null);
});
small.stop();
console.log(failures ? `${failures}개 실패` : "모두 통과");
process.exit(failures ? 1 : 0);
