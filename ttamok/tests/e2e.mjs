// 실제 브라우저로 따목을 검증한다: 클릭/터치 착수, 포획 애니메이션·점수, 무르기, 오목 승리, 랭크 대국.
// 사용: npm run build && node tests/e2e.mjs   (임시 데이터 폴더로 서버를 띄운다)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const dataDir = mkdtempSync(join(tmpdir(), "ttamok-e2e-"));
const shotDir = process.env.SHOT_DIR;
if (shotDir) mkdirSync(shotDir, { recursive: true });
const port = 8800 + Math.floor(Math.random() * 100);
const server = spawn(process.execPath, ["server/index.ts"], { env: { ...process.env, PORT: String(port), TTAMOK_DATA_DIR: dataDir }, stdio: "pipe" });
await new Promise((res, rej) => {
  server.stdout.on("data", (d) => String(d).includes("따목 서버") && res());
  server.on("exit", () => rej(new Error("server exited")));
});
const base = `http://localhost:${port}`;
const browser = await chromium.launch();
let failures = 0;

async function check(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); } catch (e) { failures++; console.log(`✗ ${name}\n  ${e.message}`); }
}

/** 교차점 (row,col)을 실제 화면 좌표로 누른다 (Board.tsx: PAD 7, CELL 10) */
async function tap(page, row, col, { touch = false } = {}) {
  const box = await page.locator("svg.board").boundingBox();
  const n = await page.locator("svg.board").evaluate((el) => el.viewBox.baseVal.width);
  const unit = box.width / n;
  const x = box.x + (7 + col * 10) * unit, y = box.y + (7 + row * 10) * unit;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
const stones = (page) => page.locator("svg.board .stone").count();
const counts = (page) => page.locator(".score-card .count").allTextContents();

for (const [label, ctx] of [
  ["phone 390×844", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
  ["desktop 1280×800", { viewport: { width: 1280, height: 800 } }],
]) {
  const context = await browser.newContext(ctx);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const touch = label.startsWith("phone");

  await check(`[${label}] 바둑판이 화면 안에 다 들어온다`, async () => {
    const box = await page.locator("svg.board").boundingBox();
    const vw = ctx.viewport.width;
    assert.ok(box.x >= 0 && box.x + box.width <= vw + 0.5, `board ${box.x}..${box.x + box.width} vs ${vw}`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(scrollW <= vw, `horizontal scroll ${scrollW}`);
  });

  await check(`[${label}] 흑 선착, 착수·포획·점수·무르기`, async () => {
    assert.match(await page.locator(".status").textContent(), /흑 차례/);
    // 흑(7,8) 백(7,7) 흑(7,9) 백(7,10) → 백이 흑 두 점 포획
    for (const [r, c] of [[7, 8], [7, 7], [7, 9]]) await tap(page, r, c, { touch });
    assert.equal(await stones(page), 3);
    await tap(page, 7, 9, { touch }); // 이미 돌이 있는 곳: 변화 없음
    assert.equal(await stones(page), 3);
    await tap(page, 7, 10, { touch });
    assert.equal(await stones(page), 2);
    assert.deepEqual(await counts(page), ["0", "2"]);
    assert.equal(await page.locator(".capture-fx .captured").count(), 2);
    if (shotDir) await page.waitForTimeout(800), await page.screenshot({ path: join(shotDir, `${touch ? "phone" : "desktop"}-capture.png`) });
    await page.getByRole("button", { name: "무르기" }).first().click();
    assert.equal(await stones(page), 3);
    assert.deepEqual(await counts(page), ["0", "0"]);
    assert.match(await page.locator(".status").textContent(), /백 차례/);
  });

  await check(`[${label}] 오목 승리 → 결과 화면, 이후 착수 불가`, async () => {
    await page.getByRole("button", { name: "새 대국" }).first().click();
    const seq = [[3, 3], [10, 0], [3, 4], [10, 2], [3, 5], [10, 4], [3, 6], [10, 6], [3, 7]];
    for (const [r, c] of seq) await tap(page, r, c, { touch });
    await page.locator(".result-card").waitFor();
    assert.match(await page.locator(".result-card h2").textContent(), /흑 승리/);
    assert.match(await page.locator(".result-badge").textContent(), /오목/);
    if (shotDir) await page.waitForTimeout(800), await page.screenshot({ path: join(shotDir, `${touch ? "phone" : "desktop"}-five.png`) });
    await page.getByRole("button", { name: "판 보기" }).click();
    const before = await stones(page);
    await tap(page, 12, 12, { touch });
    assert.equal(await stones(page), before);
    await page.getByRole("button", { name: "새 대국" }).first().click();
    assert.equal(await stones(page), 0);
    assert.deepEqual(await counts(page), ["0", "0"]);
  });

  await check(`[${label}] JS 오류 없음`, async () => assert.deepEqual(errors, []));
  await context.close();
}

await check("[phone] AI 대국: 내가 두면 AI가 응수, 무르기는 내 차례로 되돌린다", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator("select").nth(1).selectOption({ label: "AI 3급" });
  await page.getByRole("button", { name: "흑으로 두기" }).click();
  await page.locator(".score-name", { hasText: "AI 3급" }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await tap(page, 7, 7, { touch: true });
  await page.waitForFunction(() => document.querySelectorAll("svg.board .stone").length === 2, null, { timeout: 10000 });
  assert.match(await page.locator(".status").textContent(), /흑 차례/);
  await tap(page, 1, 13, { touch: true }); // AI 응수와 겹치지 않을 먼 자리
  await page.waitForFunction(() => document.querySelectorAll("svg.board .stone").length === 4, null, { timeout: 10000 });
  if (shotDir) await page.waitForTimeout(800), await page.screenshot({ path: join(shotDir, "phone-ai.png") });
  await page.getByRole("button", { name: "무르기" }).first().click();
  assert.equal(await stones(page), 2);
  assert.match(await page.locator(".status").textContent(), /흑 차례/);
  // AI가 흑일 때: 시작하자마자 AI가 첫 수를 둔다
  await page.getByRole("button", { name: "그만두기" }).click();
  await page.getByRole("button", { name: "백으로 두기" }).click();
  await page.waitForFunction(() => document.querySelectorAll("svg.board .stone").length === 1, null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  await context.close();
});

await check("[phone] 랭크 대국: 두 계정 로그인 → 대국 → 서버 검증 후 점수 반영", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(base);
  for (const [who, name] of [["흑", "방송인A"], ["백", "viewer_b"]]) {
    await page.getByLabel(`${who} 아이디`).fill(name);
    await page.getByLabel(`${who} 비밀번호`).fill("password1");
    await page.locator(".seat", { hasText: who }).getByRole("button", { name: "가입" }).click();
    await page.locator(".seat-user", { hasText: name }).waitFor();
  }
  await page.getByRole("button", { name: "랭크 대국 시작" }).click();
  await page.locator(".rated-tag").waitFor();
  await page.waitForFunction(() => window.scrollY === 0); // 대국 시작 시 바둑판으로 스크롤이 끝날 때까지
  assert.ok(await page.getByRole("button", { name: "무르기" }).first().isDisabled());
  // 백이 따내기 5번 = 10개로 승리
  for (let k = 0; k < 5; k++) {
    const r = k * 2;
    for (const [rr, cc] of [[r, 1], [r, 0], [r, 2], [r, 3]]) await tap(page, rr, cc, { touch: true });
  }
  await page.locator(".rating-row").first().waitFor();
  assert.match(await page.locator(".result-card h2").textContent(), /백 승리/);
  assert.match(await page.locator(".result-badge").textContent(), /따내기/);
  const rows = await page.locator(".rating-row").allTextContents();
  assert.ok(rows.some((t) => t.includes("viewer_b") && t.includes("+")), rows.join(" | "));
  if (shotDir) await page.waitForTimeout(800), await page.screenshot({ path: join(shotDir, "phone-rated.png") });
  await page.getByRole("button", { name: "판 보기" }).click();
  await page.locator("details.leaderboard summary").click();
  await page.locator(".leaderboard li").first().waitFor();
  assert.match(await page.locator(".leaderboard li").first().textContent(), /viewer_b/);
  await context.close();
});

await browser.close();
server.kill();
rmSync(dataDir, { recursive: true, force: true });
console.log(failures ? `${failures}개 실패` : "모두 통과");
process.exit(failures ? 1 : 0);
