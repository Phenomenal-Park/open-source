// Field-Ready Alpha acceptance (spec §135 + §136) through the real UI on a phone-sized viewport.
// Prereqs: `bash scripts/local-db.sh reset --empty` and `npm run dev` with .env.local (local DB mode).
// Run: node tests/e2e/field-acceptance.mjs [baseUrl]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // devDependency or globally installed
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";
const sql = (q) => execFileSync("bash", ["scripts/local-db.sh", "psql", "-t", "-A", "-c", q], { encoding: "utf8" }).trim();
let step = 0;
const ok = (cond, msg) => {
  step++;
  if (!cond) { console.error(`✗ ${step}. ${msg}`); process.exitCode = 1; throw new Error(msg); }
  console.log(`✓ ${step}. ${msg}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  // login
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#email", "dev-owner@localhost");
  await page.fill("#pw", "local-dev-password");
  await page.click("button:has-text('로그인')");
  await page.waitForURL(/\/admin\/field/);

  // 1–2 empty DB shows 다음 M-001
  await page.getByText("다음 M-001").waitFor();
  ok(true, "open /admin/field — empty DB shows 다음 M-001");

  const map = await page.locator(".mapwrap").boundingBox();
  const cx = map.x + map.width / 2, cy = map.y + map.height / 2;

  // 3–7 tap → candidate, sheet, M preview, coordinate
  await page.mouse.click(cx, cy);
  await page.locator('.marker[data-state="candidate"]').waitFor();
  ok(true, "tap on empty map → candidate marker appears");
  ok(await page.getByText("등록 위치 (M-001)").isVisible(), "candidate callout previews M-001");
  ok(await page.locator(".sheet").getByText("M-001", { exact: true }).isVisible(), "creation sheet shows M-001");
  ok(/37\.\d{6}, 126\.\d{6}/.test(await page.locator(".sheet").innerText()), "coordinate prefilled");

  // 8 category
  await page.getByRole("radio", { name: "디저트·과일" }).click();
  // 9 five rows
  const nameInputs = page.getByPlaceholder("상품명 입력");
  ok((await nameInputs.count()) === 5, "five product/price rows immediately available");
  // 10–12 three items, different spice, rows 4–5 empty
  const prices = page.getByPlaceholder("가격 입력");
  await nameInputs.nth(0).fill("딸기모찌"); await prices.nth(0).fill("5000");
  await nameInputs.nth(1).fill("초코모찌"); await prices.nth(1).fill("5000");
  await nameInputs.nth(2).fill("매운 떡"); await prices.nth(2).fill("4500");
  ok((await prices.nth(0).inputValue()) === "5,000", "price 5000 is formatted as 5,000");
  const spice = page.locator('button[aria-label^="맵기"]');
  await spice.nth(1).click(); // → 안 매움 (0)
  for (let i = 0; i < 3; i++) await spice.nth(2).click(); // → 2단계
  // 13 hours untouched — 14 save
  await page.getByRole("button", { name: /^저장/ }).click();
  await page.getByText("M-001 저장됨").waitFor();
  ok(true, "save → toast 'M-001 저장됨'");

  // 15–18 DB checks
  ok(sql("select m_number from spots") === "1", "spot received M-001");
  ok(sql("select count(*) from stall_menu_items") === "3", "only three menu rows persisted");
  ok(sql("select hours_mode from stalls") === "DEFAULT", "default hours inherited");
  ok(sql("select display_name from stall_menu_items where is_representative") === "딸기모찌", "first item is representative");
  ok(sql("select string_agg(coalesce(operator_spice_level::text,'null'), ',' order by display_order) from stall_menu_items") === "null,0,2", "per-item spice saved (unknown, 0, 2)");

  // 19–20
  await page.getByText("다음 M-002").waitFor();
  ok((await page.locator('.marker:not([data-state="candidate"])').count()) === 1, "marker immediately appears");
  ok(await page.getByText("다음 M-002").isVisible(), "header becomes 다음 M-002");
  ok(!(await page.locator('.marker[data-state="candidate"]').count()), "sheet closed, no candidate");

  // 21–22 second spot
  await page.mouse.click(cx + 80, cy - 60);
  await page.getByRole("radio", { name: "튀김·분식" }).click();
  await page.getByPlaceholder("상품명 입력").nth(0).fill("떡볶이");
  await page.getByPlaceholder("가격 입력").nth(0).fill("5000");
  await page.getByRole("button", { name: /^저장/ }).click();
  await page.getByText("M-002 저장됨").waitFor();
  ok(sql("select string_agg(m_number::text, ',' order by m_number) from spots") === "1,2", "second spot becomes M-002");

  // 23–24 cancel a third candidate
  await page.mouse.click(cx - 80, cy + 60);
  await page.getByText("등록 위치 (M-003)").waitFor();
  await page.getByRole("button", { name: "취소" }).click();
  ok(!(await page.locator('.marker[data-state="candidate"]').count()), "cancelled candidate removed");
  ok(sql("select count(*) from spots") === "2", "cancel does not create a spot");
  ok(await page.getByText("다음 M-003").isVisible(), "M-003 not consumed by cancel");

  // 25 next real save gets M-003 (retail: no spice column needed)
  await page.mouse.click(cx - 80, cy + 60);
  await page.getByRole("radio", { name: "패션·잡화" }).click();
  await page.getByPlaceholder("상품명 입력").nth(0).fill("양말");
  ok((await page.locator('button[aria-label^="맵기"]').count()) === 0, "retail rows hide spice control");
  await page.getByRole("button", { name: /^저장/ }).click();
  await page.getByText("M-003 저장됨").waitFor();
  ok(sql("select max(m_number) from spots") === "3", "next real save gets M-003");

  // 26 nearby-duplicate warning: zoom in and tap ~3 m from M-001 (which is at the map centre)
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.waitForTimeout(200);
  await page.mouse.click(cx + 32, cy + 4);
  await page.getByText("근처 등록 위치").waitFor();
  ok(await page.getByText(/M-001 · 약 \dm/).isVisible(), "nearby warning lists M-001 with distance");
  await page.getByRole("radio", { name: "간식·스낵" }).click();
  ok(await page.getByRole("button", { name: /^저장/ }).isDisabled(), "save blocked until '새 위치 등록' confirmed");
  await page.getByRole("button", { name: "새 위치 등록" }).click();
  ok(await page.getByRole("button", { name: /^저장/ }).isEnabled(), "confirming new location enables save");
  await page.getByRole("button", { name: "취소" }).click();

  // 27–28 reload persists
  await page.reload();
  await page.getByText("다음 M-004").waitFor();
  ok((await page.locator(".marker").count()) === 3 && (await page.getByText("등록 3").isVisible()), "reload: all saved data remains");

  // ── §136 patrol ──
  await page.locator("button.tag", { hasText: "현장 등록" }).click();
  await page.getByRole("menuitemradio", { name: "순찰" }).click();
  await page.locator(".sheet").getByText(/^O-001 \/ 3$/).waitFor();
  ok(true, "patrol starts at O-001");
  await page.getByRole("button", { name: "그대로" }).click();
  await page.locator(".sheet").getByText(/^O-002 \/ 3$/).waitFor();
  ok(sql("select count(*) from observations where result='SAME'") === "1", "그대로 saves observation and auto-advances to O-002");
  await page.getByRole("button", { name: "오늘 없음" }).click();
  await page.locator(".sheet").getByText(/^O-003 \/ 3$/).waitFor();
  ok(sql("select count(*) from observations where result='NO_STALL'") === "1", "오늘 없음 saves NO_STALL");
  ok(sql("select count(*) from spots where status='active'") === "3", "spot remains active after NO_STALL");
  await page.getByRole("button", { name: "확인 어려움" }).click();
  await page.getByText("O-003 확인 어려움").waitFor();
  ok(sql("select count(*) from observations where result='UNCERTAIN'") === "1", "확인 어려움 saves UNCERTAIN");

  // 변경 on O-001: price change, history preserved
  await page.getByRole("button", { name: "이전" }).click();
  await page.getByRole("button", { name: "이전" }).click();
  await page.locator(".sheet").getByText(/^O-001 \/ 3$/).waitFor();
  await page.getByRole("button", { name: "변경" }).click();
  const dlg = page.getByRole("dialog", { name: "변경 기록" });
  await dlg.getByPlaceholder("가격 입력").first().waitFor();
  await page.waitForFunction(() => document.querySelector('[role=dialog] input[placeholder="상품명 입력"]')?.value === "딸기모찌");
  await dlg.getByPlaceholder("가격 입력").first().fill("5500");
  await dlg.getByRole("button", { name: "변경 저장" }).click();
  await page.getByText("O-001 변경 저장됨").waitFor();
  ok(sql("select price_amount from stall_menu_items where display_name='딸기모찌' and deleted_at is null") === "5500", "변경: price updated");
  ok(sql("select count(*) from price_observations po join stall_menu_items m on m.id=po.menu_item_id where m.display_name='딸기모찌'") === "2", "price history intact");
  ok(sql("select count(*) from observations where result='CHANGED'") === "1", "CHANGED observation recorded");
  ok(sql("select count(*) from stall_menu_items where deleted_at is null") === "5", "other menu items untouched");

  ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  console.log(`\nALL ${step} FIELD ACCEPTANCE CHECKS PASSED`);
} finally {
  await page.screenshot({ path: process.env.SHOT ?? "/tmp/field-final.png" }).catch(() => {});
  await browser.close();
}
