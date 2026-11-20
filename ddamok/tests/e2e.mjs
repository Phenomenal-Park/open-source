// 실제 브라우저(Playwright)로 따목을 검증한다. 서버는 로컬 Cloudflare(wrangler dev).
//   - 같은 화면 2인 대국: 클릭·터치, 포획 애니메이션·점수, 무르기, 오목 승리, 승리 후 착수 불가
//   - AI 대국
//   - 온라인: 두 사람이 각자 가입·이메일 인증 → 친구매치(오목) → 레이팅매치(기권, 점수 ?) → 프로필 → 기보
// 사용: npm run test:e2e   (SHOT_DIR=폴더 를 주면 스크린샷 저장)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { startServer } from "./serve.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const shotDir = process.env.SHOT_DIR;
if (shotDir) mkdirSync(shotDir, { recursive: true });
const server = await startServer();
const base = server.base;
const browser = await chromium.launch();
let failures = 0;


/** 사이드 상자(로그인·온라인·AI·디자인)는 처음엔 접혀 있다 — 기능 테스트에서는 펼친 상태로 시작 */
const openFolds = (context) => context.addInitScript(() => {
  for (const k of ["login", "online", "ai"]) localStorage.setItem(`ddamok.fold.${k}`, "1");
});

async function check(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); } catch (e) { failures++; console.log(`✗ ${name}\n  ${e.message.split("\n").slice(0, 4).join("\n  ")}`); }
}
const shot = async (page, name) => { if (shotDir) { await page.waitForTimeout(800); await page.screenshot({ path: join(shotDir, `${name}.png`) }); } };

/** 교차점 (row,col)을 실제 화면 좌표로 누른다 (Board.tsx: PAD 7, CELL 10) */
async function tap(page, row, col, { touch = false } = {}) {
  const board = page.locator("svg.board").first();
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  const n = await board.evaluate((el) => el.viewBox.baseVal.width);
  const unit = box.width / n;
  const x = box.x + (7 + col * 10) * unit, y = box.y + (7 + row * 10) * unit;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
const stones = (page) => page.locator("svg.board .stone").count();
const counts = (page) => page.locator(".score-card .count").allTextContents();
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "ko-KR" };
const DESKTOP = { viewport: { width: 1280, height: 800 }, locale: "ko-KR" };

for (const [label, ctx] of [["phone 390×844", PHONE], ["desktop 1280×800", DESKTOP]]) {
  const context = await browser.newContext(ctx);
  await openFolds(context);
  // 소리 세기: 착수음은 진동자 1개, 따냄 "딸그락"은 여러 개를 더 쓴다
  await context.addInitScript(() => {
    window.__osc = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const touch = label.startsWith("phone");

  await check(`[${label}] 바둑판이 화면 안에 다 들어오고 가로 스크롤이 없다`, async () => {
    const box = await page.locator("svg.board").boundingBox();
    const vw = ctx.viewport.width;
    assert.ok(box.x >= 0 && box.x + box.width <= vw + 0.5, `board ${box.x}..${box.x + box.width} vs ${vw}`);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= vw);
  });

  await check(`[${label}] 흑 선착, 착수·포획·점수·무르기`, async () => {
    assert.match(await page.locator(".status").textContent(), /흑 차례 · 첫 수는 천원/);
    assert.equal(await page.locator(".center-hint").count(), 1);
    await tap(page, 3, 3, { touch }); // 첫 수는 천원만: 변화 없음
    assert.equal(await stones(page), 0);
    // 흑(7,7) 백(7,6) 흑(7,8) 백(7,9) → 백이 흑 두 점 포획
    for (const [r, c] of [[7, 7], [7, 6], [7, 8]]) await tap(page, r, c, { touch });
    assert.equal(await stones(page), 3);
    assert.equal(await page.evaluate(() => window.__osc), 3, "착수마다 착수음 한 번");
    await tap(page, 7, 8, { touch }); // 이미 돌이 있는 곳: 변화 없음
    assert.equal(await stones(page), 3);
    const osc = () => page.evaluate(() => window.__osc);
    const before = await osc();
    await tap(page, 7, 9, { touch });
    assert.equal(await stones(page), 2);
    assert.ok((await osc()) - before >= 6, "따내면 착수음 뒤에 딸그락 소리");
    assert.deepEqual(await counts(page), ["0", "2"]);
    assert.equal(await page.locator(".capture-fx .captured").count(), 2);
    await shot(page, `${touch ? "phone" : "desktop"}-capture`);
    await page.getByRole("button", { name: "무르기" }).first().click();
    assert.equal(await stones(page), 3);
    assert.deepEqual(await counts(page), ["0", "0"]);
    assert.match(await page.locator(".status").textContent(), /백 차례/);
  });

  await check(`[${label}] 오목 승리 → 결과 화면, 이후 착수 불가, 새 대국`, async () => {
    await page.getByRole("button", { name: "새 대국" }).first().click();
    for (const [r, c] of [[7, 7], [10, 0], [7, 8], [10, 2], [7, 9], [10, 4], [7, 10], [10, 6], [7, 11]]) await tap(page, r, c, { touch });
    await page.locator(".result-card").waitFor();
    assert.match(await page.locator(".result-card h2").textContent(), /흑 승리/);
    assert.match(await page.locator(".result-badge").textContent(), /오목/);
    await page.getByRole("button", { name: "판 보기" }).click();
    const before = await stones(page);
    await tap(page, 12, 12, { touch });
    assert.equal(await stones(page), before);
    await page.getByRole("button", { name: "새 대국" }).first().click();
    assert.equal(await stones(page), 0);
  });

  await check(`[${label}] JS 오류 없음`, async () => assert.deepEqual(errors, []));
  await context.close();
}

await check("[화면 구성] 로그인·온라인·AI 상자는 처음엔 제목만(⌄로 펼치고 기억) / 프로필·랭킹·기보·업적 버튼과 규칙·설정은 화면 전환 + 좌상단 [← 이전] / 판 크기 선택 없음", async () => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto(base);
  assert.equal(await page.locator(".fold").count(), 3);
  assert.equal(await page.getByText("판 크기").count(), 0);
  // 규칙 → 화면 전환, [← 이전]으로 돌아온다
  assert.deepEqual(await page.locator(".info-buttons .btn").allTextContents(), ["프로필", "랭킹", "기보", "업적"]);
  await page.locator(".site-footer").getByRole("link", { name: "규칙" }).click();
  await page.waitForURL(/\/rules$/);
  await page.getByText("정확히 5개", { exact: false }).first().waitFor();
  assert.equal(await page.locator(".page-title").textContent(), "규칙");
  await page.getByRole("button", { name: "이전" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/");
  // 랭킹·업적·설정 화면
  for (const [path, title] of [["/rankings", "랭킹"], ["/achievements", "업적"], ["/settings", "설정"]]) {
    await page.goto(base + path);
    assert.equal(await page.locator(".page-title").textContent(), title);
  }
  await page.getByRole("radiogroup", { name: "바둑판" }).getByRole("radio", { name: "카툰" }).click();
  await page.goto(base);
  assert.equal(await page.locator("svg.board.look-board-cartoon").count(), 1);
  assert.equal(await page.locator(".fold-body").count(), 0);
  const online = page.getByRole("button", { name: "온라인 대국" });
  assert.equal(await online.getAttribute("aria-expanded"), "false");
  await online.click();
  assert.equal(await online.getAttribute("aria-expanded"), "true");
  await page.getByRole("button", { name: "레이팅매치" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "레이팅매치" }).waitFor();
  assert.equal(await page.locator(".fold-body").count(), 1);
  await shot(page, "phone-folds");
  await context.close();
});

await check("[언어] 브라우저 언어로 영어·일본어 화면, 메뉴에서 바꾸면 유지", async () => {
  for (const [locale, play, name, rule] of [["en-US", "Play", "hidden ddamok", "exactly five"], ["ja-JP", "対局", "ヒドゥンタモク", "ちょうど5つ"]]) {
    const context = await browser.newContext({ ...PHONE, locale });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    assert.equal(await page.locator(".brand h1").textContent(), name);
    assert.equal(await page.evaluate(() => document.documentElement.lang), locale.slice(0, 2));
    void play;
    // 언어 선택 목록(한국어/English/日本語)은 각 언어 자체 표기이므로 제외
    const text = await page.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll(".lang-select").forEach((x) => x.remove()); return c.innerText; });
    assert.ok(!/[가-힣]/.test(text), `${locale}: 한국어가 섞이지 않음`);
    await shot(page, `phone-${locale}`);
    await page.goto(base + "/rules");
    assert.match(await page.locator("main").textContent(), new RegExp(rule));
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext({ ...PHONE, locale: "en-US" });
  const page = await context.newPage();
  await page.goto(base + "/settings");
  await page.getByLabel("Language").selectOption("ja");
  await page.waitForFunction(() => document.documentElement.lang === "ja"); // 언어를 바꾸면 화면을 다시 연다
  await page.goto(base);
  await page.locator(".brand h1", { hasText: "ヒドゥンタモク" }).waitFor();
  await page.goto(base + "/records");
  assert.equal(await page.locator(".page-title").textContent(), "棋譜");
  await context.close();
});

/** 착수음 세기: 착수음은 0.1초보다 짧은 잡음 버퍼를 튼다(히든 효과음은 길다) */
const countStoneClicks = () => {
  window.__clicks = 0;
  const orig = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if ((this.buffer?.duration ?? 1) < 0.1) window.__clicks++; return orig.apply(this, a); };
};

await check("[phone] AI 대국: 내가 두면 AI가 응수(착수음), 무르기는 내 차례로", async () => {
  const context = await browser.newContext(PHONE);
  await openFolds(context);
  await context.addInitScript(countStoneClicks);
  const page = await context.newPage();
  await page.goto(base);
  await page.getByLabel("기력").selectOption("ai-6");
  await page.getByRole("button", { name: "흑으로 두기" }).click();
  await page.locator(".score-name", { hasText: "AI 다이아" }).waitFor();
  // AI(백)가 히든으로 둘 수도 있어(그러면 흑 화면에 돌이 안 보인다) 돌 개수 대신 수 번호로 확인
  const myTurnAt = (n) => page.waitForFunction((k) => new RegExp(`흑 차례 · ${k}수째`).test(document.querySelector(".status")?.textContent ?? ""), n, { timeout: 15000 });
  await tap(page, 7, 7, { touch: true });
  await myTurnAt(3);
  assert.equal(await page.evaluate(() => window.__clicks), 2, "내 수와 AI 수에 착수음 한 번씩");
  const visible = await stones(page);
  await tap(page, 1, 13, { touch: true });
  await myTurnAt(5);
  await page.getByRole("button", { name: "무르기" }).first().click();
  await myTurnAt(3);
  assert.equal(await stones(page), visible);
  assert.equal(await page.evaluate(() => window.__clicks), 4, "무르기에는 착수음이 없다");
  await context.close();
});

await check("[설정] 소리: 착수음·효과음 볼륨과 음소거, 음소거하면 착수음이 안 난다", async () => {
  const context = await browser.newContext(PHONE);
  await openFolds(context);
  await context.addInitScript(countStoneClicks);
  const page = await context.newPage();
  await page.goto(`${base}/settings`);
  const stoneVol = page.getByLabel("착수음 볼륨");
  await stoneVol.fill("40");
  await page.getByLabel("효과음 볼륨").waitFor();
  await page.locator(".sound-row", { hasText: "착수음" }).getByLabel("음소거").check();
  assert.ok(await stoneVol.isDisabled());
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ddamok.sound")));
  assert.deepEqual(saved.stone, { vol: 40, mute: true });
  await page.goto(base);
  await page.getByLabel("기력").selectOption("ai-1");
  await page.getByRole("button", { name: "흑으로 두기" }).click();
  await tap(page, 7, 7, { touch: true });
  await page.waitForFunction(() => /흑 차례 · 3수째/.test(document.querySelector(".status")?.textContent ?? ""), null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__clicks), 0);
  await context.close();
});

/** 가입 + 이메일 인증(개발용 서버는 화면에 코드를 보여 준다) */
async function signUp(page, name, email) {
  await page.goto(base);
  await page.getByRole("button", { name: "가입" }).click();
  await page.getByLabel("닉네임").fill(name);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("password1");
  await page.locator(".check input[required]").check();
  await page.getByRole("button", { name: "가입하고 인증 코드 받기" }).click();
  const note = await page.locator(".auth-form .muted", { hasText: "인증 코드" }).last().textContent({ timeout: 10000 });
  const code = note.match(/(\d{6})/)?.[1];
  assert.ok(code, note);
  await page.getByLabel("인증 코드").fill(code);
  await page.getByRole("button", { name: "인증", exact: true }).click();
  await page.locator(".greeting", { hasText: name }).waitFor();
}

const ctxA = await browser.newContext(PHONE);
const ctxB = await browser.newContext(DESKTOP);
await openFolds(ctxA); await openFolds(ctxB);
const A = await ctxA.newPage(), B = await ctxB.newPage();
const errs = [];
for (const p of [A, B]) p.on("pageerror", (e) => errs.push(e.message));

await check("[온라인] 두 사람이 각자 가입·이메일 인증", async () => {
  await signUp(A, "방송인A", "streamer-a@example.com");
  await signUp(B, "viewer_b", "viewer-b@example.com");
  assert.ok(await A.getByRole("button", { name: "레이팅매치" }).isEnabled());
  await shot(A, "phone-online-ready");
});

/** 내 색: 점수판에 "(나)"가 붙은 쪽 */
const myColor = async (page) => ((await page.locator(".score-card.black .score-name").textContent()).includes("(나)") ? "black" : "white");

await check("[온라인] 친구매치: 같은 코드 → 대국 → 오목 승리가 양쪽에 보인다", async () => {
  for (const p of [A, B]) {
    await p.getByLabel("친구매치 코드").fill("24680");
    await p.getByRole("button", { name: "친구매치" }).click();
  }
  await A.locator(".score-name", { hasText: "(나)" }).waitFor({ timeout: 15000 });
  await B.locator(".score-name", { hasText: "(나)" }).waitFor({ timeout: 15000 });
  const black = (await myColor(A)) === "black" ? A : B;
  const white = black === A ? B : A;
  const waitStones = (p, n) => p.waitForFunction((k) => document.querySelectorAll("svg.board .stone").length === k, n, { timeout: 10000 });
  for (let i = 0; i < 4; i++) {
    await tap(black, 7, 7 + i, { touch: black === A });
    await waitStones(white, i * 2 + 1);
    await tap(white, 0, i, { touch: white === A });
    await waitStones(black, i * 2 + 2);
  }
  await tap(black, 7, 11, { touch: black === A });
  for (const p of [A, B]) await p.locator(".result-card").waitFor({ timeout: 10000 });
  assert.match(await black.locator(".result-card h2").textContent(), /승리/);
  assert.match(await white.locator(".result-card h2").textContent(), /패배/);
  assert.equal(await A.locator(".rating-row").count(), 0); // 친구매치는 점수 미반영
  await shot(A, "phone-online-friend-result");
  for (const p of [A, B]) await p.getByRole("button", { name: "새 대국" }).first().click();
});

await check("[온라인] 레이팅매치: 가까운 점수끼리 매칭 → 기권 → 점수 변화(확정 전 ?)", async () => {
  for (const p of [A, B]) await p.getByRole("button", { name: "레이팅매치" }).click();
  await A.locator(".score-name", { hasText: "(나)" }).waitFor({ timeout: 15000 });
  await B.locator(".score-name", { hasText: "(나)" }).waitFor({ timeout: 15000 });
  assert.match(await A.locator(".side .panel h2").first().textContent(), /레이팅매치/);
  A.once("dialog", (d) => d.accept());
  await A.getByRole("button", { name: "기권" }).click();
  for (const p of [A, B]) await p.locator(".rating-row").first().waitFor({ timeout: 10000 });
  assert.match(await A.locator(".result-badge").textContent(), /기권/);
  const rows = await B.locator(".rating-row").allTextContents();
  assert.ok(rows.some((t) => t.includes("viewer_b") && t.includes("?") && t.includes("+")), rows.join(" | "));
  await shot(B, "desktop-online-rated-result");
  await B.getByRole("button", { name: "새 대국" }).first().click();
  await B.locator(".greeting").waitFor();
  assert.match(await B.locator(".greeting").textContent(), /\?점/);
});

await check("[프로필·설정] 급·점수(?)·전적, 설정 화면의 AI 상대 허용이 저장된다", async () => {
  await B.goto(base + "/profile");
  await B.locator(".big-rank").waitFor();
  assert.match(await B.locator(".big-rating").textContent(), /\?점/);
  assert.match(await B.locator(".stats").textContent(), /1승 0패 0무/);
  assert.match(await B.locator(".stats").textContent(), /승률100%/);
  assert.match(await B.locator(".records h2").first().textContent(), /명승부 0\/3/);
  assert.equal(await B.locator(".profile ~ .records .record-list li").count(), 2); // 최근 대국
  await shot(B, "desktop-profile");
  await B.goto(base + "/settings");
  await B.waitForFunction(() => !document.querySelector(".setting input")?.disabled);
  const box = B.locator(".setting input");
  assert.equal(await box.isChecked(), true);
  await box.uncheck();
  await B.waitForTimeout(500);
  await B.reload();
  await B.waitForFunction(() => !document.querySelector(".setting input")?.disabled);
  assert.equal(await B.locator(".setting input").isChecked(), false);
});

await check("[프로필] 다른 사람 프로필: 닉네임으로 찾아 급·점수·전적·명승부·최근 대국을 본다(설정은 없음)", async () => {
  await A.goto(base + "/profile");
  await A.getByPlaceholder("닉네임으로 프로필 찾기").fill("viewer_b");
  await A.getByRole("button", { name: "찾기" }).click();
  await A.waitForURL(/\/profile\?user=viewer_b/);
  await A.locator(".big-rank").waitFor();
  assert.match(await A.locator(".profile h2").textContent(), /viewer_b/);
  assert.match(await A.locator(".stats").textContent(), /1승 0패 0무/);
  assert.equal(await A.locator(".setting input").count(), 0);
  assert.ok(await A.locator(".mode-filter .chip").count() >= 4);
  await shot(A, "phone-other-profile");
});

await check("[기보] 닉네임 검색 → 최근 기보 → 수순 넘겨 보기", async () => {
  await A.goto(base + "/records");
  await A.getByLabel("닉네임").fill("viewer_b");
  await A.getByRole("button", { name: "찾기" }).click();
  await A.locator(".record-list li").first().waitFor();
  assert.equal(await A.locator(".record-list li").count(), 2);
  await A.locator(".record-list li a").last().click(); // 친구매치(오목) 기보
  await A.locator(".viewer .step").waitFor();
  assert.match(await A.locator(".viewer .step").textContent(), /9 \/ 9수/);
  assert.equal(await stones(A), 9);
  await A.getByRole("button", { name: "처음" }).click();
  assert.equal(await stones(A), 0);
  await A.getByRole("button", { name: "다음 수" }).click();
  assert.equal(await stones(A), 1);
  await shot(A, "phone-records");
});

await check("[명승부] 기보 화면에서 박제 → 프로필에 '명승부 1/3', 상대 닉네임·당시 점수, '흑번 9수끝 오목승' 표기", async () => {
  await A.goto(base + "/records?user=" + encodeURIComponent("방송인A"));
  await A.locator(".record-list li a").last().click(); // 친구매치(오목) 기보
  await A.getByRole("button", { name: /명승부로 박제/ }).click();
  await A.getByRole("button", { name: /명승부 해제 · 1\/3/ }).waitFor();
  await A.goto(base + "/profile");
  await A.locator(".records h2", { hasText: "명승부 1/3" }).waitFor();
  const fav = await A.locator(".records").first().locator(".record-list li").first().textContent();
  assert.match(fav, /viewer_b \(500\?\)/, fav);
  assert.match(fav, /(흑번 9수끝 오목승|백번 9수끝 오목패)/, fav);
  await shot(A, "phone-profile-fav");
});

await check("[안내 페이지] 소개·규칙·문의·개인정보 처리방침", async () => {
  for (const [path, text] of [["/about", "히든따목 소개"], ["/rules", "히든따목 규칙"], ["/contact", "문의"], ["/privacy", "개인정보 처리방침"]]) {
    await B.goto(base + path);
    assert.match(await B.locator("article h2").textContent(), new RegExp(text));
  }
  assert.match(await B.locator("article").textContent(), /이메일|만 14세/);
  await B.goto(base + "/rules");
  assert.match(await B.locator("article").textContent(), /무승부/);
});

await check("[온라인] JS 오류 없음", async () => assert.deepEqual(errs, []));

await browser.close();
if (failures) console.log(server.log().split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-10).join("\n"));
server.stop();
console.log(failures ? `${failures}개 실패` : "모두 통과");
process.exit(failures ? 1 : 0);
