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
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

for (const [label, ctx] of [["phone 390×844", PHONE], ["desktop 1280×800", DESKTOP]]) {
  const context = await browser.newContext(ctx);
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
    assert.match(await page.locator(".status").textContent(), /흑 차례/);
    for (const [r, c] of [[7, 8], [7, 7], [7, 9]]) await tap(page, r, c, { touch });
    assert.equal(await stones(page), 3);
    await tap(page, 7, 9, { touch }); // 이미 돌이 있는 곳: 변화 없음
    assert.equal(await stones(page), 3);
    await tap(page, 7, 10, { touch });
    assert.equal(await stones(page), 2);
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
    for (const [r, c] of [[3, 3], [10, 0], [3, 4], [10, 2], [3, 5], [10, 4], [3, 6], [10, 6], [3, 7]]) await tap(page, r, c, { touch });
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

await check("[phone] AI 대국: 내가 두면 AI가 응수, 무르기는 내 차례로", async () => {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await page.goto(base);
  await page.getByLabel("기력").selectOption({ label: "AI 3급" });
  await page.getByRole("button", { name: "흑으로 두기" }).click();
  await page.locator(".score-name", { hasText: "AI 3급" }).waitFor();
  await tap(page, 7, 7, { touch: true });
  await page.waitForFunction(() => document.querySelectorAll("svg.board .stone").length === 2, null, { timeout: 10000 });
  await tap(page, 1, 13, { touch: true });
  await page.waitForFunction(() => document.querySelectorAll("svg.board .stone").length === 4, null, { timeout: 10000 });
  await page.getByRole("button", { name: "무르기" }).first().click();
  assert.equal(await stones(page), 2);
  await context.close();
});

/** 가입 + 이메일 인증(개발용 서버는 화면에 코드를 보여 준다) */
async function signUp(page, name, email) {
  await page.goto(base);
  await page.getByRole("button", { name: "가입" }).click();
  await page.getByLabel("닉네임").fill(name);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("password1");
  await page.locator(".check input").check();
  await page.getByRole("button", { name: "가입하고 인증 코드 받기" }).click();
  const note = await page.locator(".auth-form .muted", { hasText: "인증 코드" }).last().textContent({ timeout: 10000 });
  const code = note.match(/(\d{6})/)?.[1];
  assert.ok(code, note);
  await page.getByLabel("인증 코드").fill(code);
  await page.getByRole("button", { name: "인증", exact: true }).click();
  await page.locator(".me-name", { hasText: name }).waitFor();
}

const ctxA = await browser.newContext(PHONE);
const ctxB = await browser.newContext(DESKTOP);
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
    await tap(black, 7, 3 + i, { touch: black === A });
    await waitStones(white, i * 2 + 1);
    await tap(white, 0, i, { touch: white === A });
    await waitStones(black, i * 2 + 2);
  }
  await tap(black, 7, 7, { touch: black === A });
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
  await B.locator(".me-name").waitFor();
  assert.match(await B.locator(".me").textContent(), /\?점/);
});

await check("[프로필] 급·점수(?)·전적, AI 상대 허용 설정이 저장된다", async () => {
  await B.goto(base + "/profile");
  await B.locator(".big-rank").waitFor();
  assert.match(await B.locator(".big-rating").textContent(), /\?점/);
  assert.match(await B.locator(".stats").textContent(), /1승 0패/);
  const box = B.locator(".setting input");
  assert.equal(await box.isChecked(), true);
  await box.uncheck();
  await B.waitForTimeout(500);
  await B.reload();
  await B.locator(".big-rank").waitFor();
  await B.waitForFunction(() => !document.querySelector(".setting input")?.disabled);
  assert.equal(await B.locator(".setting input").isChecked(), false);
  await shot(B, "desktop-profile");
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

await check("[온라인] JS 오류 없음", async () => assert.deepEqual(errs, []));

await browser.close();
if (failures) console.log(server.log().split("\n").filter((l) => /error|Error|✘/.test(l)).slice(-10).join("\n"));
server.stop();
console.log(failures ? `${failures}개 실패` : "모두 통과");
process.exit(failures ? 1 : 0);
