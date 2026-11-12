// Public map / detail / localization acceptance (spec §137–§139) on a phone-sized viewport.
// Prereqs: `bash scripts/local-db.sh reset` (demo data) and `npm run dev` with .env.local.
// Run: node tests/e2e/public-acceptance.mjs [baseUrl]
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

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
  await page.goto(`${BASE}/ko`, { waitUntil: "networkidle" });
  const markers = page.locator(".marker");
  ok((await markers.count()) > 20, "main map loads with stall markers");
  const radius = await markers.first().evaluate((el) => getComputedStyle(el).borderRadius);
  ok(/^\d+%$/.test(radius) && parseFloat(radius) > 0 && parseFloat(radius) < 35, `markers are rounded squares (border-radius ${radius}, not a circle)`);
  const colors = new Set(await markers.evaluateAll((els) => els.map((e) => e.style.getPropertyValue("--cat"))));
  ok(colors.size >= 4, "category colours are mixed along streets");
  const states = await markers.evaluateAll((els) => els.map((e) => e.dataset.state));
  ok(states.every((s) => s === "default"), "unselected markers use the visible default state");
  const op = await markers.first().evaluate((el) => +getComputedStyle(el).opacity);
  ok(op >= 0.8, `default markers clearly visible (opacity ${op})`);

  const html = await page.content();
  ok(!/\bM-\d{3}\b/.test(html) && !/\bO-\d{3}\b/.test(html), "no public M/O identifiers");
  ok((await page.locator('[aria-label*="favorite" i], [aria-label*="찜"], .heart').count()) === 0, "no favorite heart");

  // ticker
  const tk = page.locator(".ticker");
  ok((await tk.boundingBox()).height <= 46, "ticker is one line high");
  const active = page.locator('.ticker__item[data-state="active"]');
  const first = await active.innerText();
  await page.waitForTimeout(5600);
  const second = await active.innerText();
  ok(first !== second, `ticker rotates after ~5 s ("${first.slice(0, 18)}…" → "${second.slice(0, 18)}…")`);
  ok(!/\d\/\d|🥇|👑/.test(first + second), "no 1/5 counter, medals or crowns");

  // §21 two click zones
  await page.locator(".ticker__label").click();
  await page.waitForURL(/\/ko\/rankings$/);
  ok(true, "'이번 주 평점 랭킹 ›' opens the Ranking page");
  await page.goBack();
  await page.locator('.ticker__item[data-state="active"]').click();
  await page.waitForURL(/\/ko\/stalls\//);
  ok(true, "rotating ranked entry opens that Stall Detail page");

  // markers never overlap (operator rule) — check on screen at three zoom levels
  const overlaps = () => page.$$eval(".marker", (els) => {
    // the selected stall's 3 px white border counts as part of it
    const r = els.map((e) => { const b = e.getBoundingClientRect(), p = e.dataset.state === "selected" ? 3 : 0;
      return { left: b.left - p, right: b.right + p, top: b.top - p, bottom: b.bottom + p }; }); let n = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
      if (r[i].left < r[j].right - 0.5 && r[j].left < r[i].right - 0.5 && r[i].top < r[j].bottom - 0.5 && r[j].top < r[i].bottom - 0.5) n++;
    return n;
  });
  await page.goto(`${BASE}/ko`, { waitUntil: "networkidle" });
  for (const z of ["확대", "축소", "축소"]) {
    await page.getByRole("button", { name: z }).click(); await page.waitForTimeout(250);
    ok((await overlaps()) === 0, `no overlapping stall squares after ${z}`);
  }
  await page.getByRole("button", { name: "확대" }).click(); await page.waitForTimeout(250);

  // selection + filters
  await page.goto(`${BASE}/ko`, { waitUntil: "networkidle" });
  await page.locator(".marker").nth(10).click({ force: true });
  ok((await page.locator('.marker[data-state="selected"]').count()) === 1, "exactly one marker gets the selected state");
  const callout = await page.locator(".callout").boundingBox();
  ok(callout && callout.height < 60 && callout.width < 320, "selected callout is compact");
  const sheet = await page.locator(".sheet").boundingBox();
  ok(sheet.height < 230, `bottom sheet stays compact (${Math.round(sheet.height)}px)`);
  ok(await page.getByRole("link", { name: /상세 보기/ }).isVisible(), "sheet has 상세 보기");
  await page.getByRole("button", { name: "꼬치·구이" }).click();
  const st2 = await page.locator(".marker").evaluateAll((els) => els.map((e) => e.dataset.state));
  ok(st2.includes("match") && st2.includes("muted"), "filter: matches vivid, others muted but present");
  ok((await overlaps()) === 0, "no overlaps with a selected stall and an active filter");
  const sub = page.locator(".chiprow").nth(2).locator("button");
  ok((await sub.count()) > 0 && (await sub.count()) <= 10, "category shows ≤10 public subcategories");

  // detail: menu-level spice voting (§50–§51)
  const spicy = sql("select s.slug from stalls s join stall_menu_items m on m.stall_id=s.id where m.display_name='떡볶이' and m.deleted_at is null limit 1");
  await page.goto(`${BASE}/ko/stalls/${spicy}`, { waitUntil: "networkidle" });
  const row = page.locator(".menuitem", { hasText: "떡볶이" }).first();
  ok((await row.locator(".chilis svg").count()) === 2, "operator spice 2 renders two custom chili icons");
  const itemId = sql(`select m.id from stall_menu_items m join stalls s on s.id=m.stall_id where s.slug='${spicy}' and m.display_name='떡볶이' and m.deleted_at is null`);
  await row.getByRole("button", { name: /얼마나 매웠나요/ }).click();
  await row.getByRole("button", { name: "매운맛을 좋아하는 분께 추천" }).click();
  await page.waitForTimeout(400);
  ok(sql(`select level from menu_spice_votes where menu_item_id='${itemId}'`) === "3", "anonymous device can vote spice on a specific item");
  await row.getByRole("button", { name: "살짝 매콤" }).click();
  await page.waitForTimeout(400);
  ok(sql(`select count(*)||':'||max(level) from menu_spice_votes where menu_item_id='${itemId}'`) === "1:1", "changing the vote keeps one vote per device");
  await row.getByRole("button", { name: "살짝 매콤" }).click();
  await page.waitForTimeout(400);
  ok(sql(`select count(*) from menu_spice_votes where menu_item_id='${itemId}'`) === "0", "same choice again removes the vote");
  ok(sql(`select operator_spice_level from stall_menu_items where id='${itemId}'`) === "2", "community votes never overwrite operator spice");

  // review: rating only, no login (§60–§61)
  const before = +sql("select count(*) from reviews");
  await page.getByRole("tab", { name: /리뷰/ }).click();
  await page.getByRole("button", { name: "리뷰 쓰기" }).click();
  await page.getByRole("radiogroup", { name: "별점" }).getByRole("radio", { name: "5" }).click();
  await page.getByRole("button", { name: "등록" }).click();
  await page.getByText("고마워요!").waitFor();
  ok(+sql("select count(*) from reviews") === before + 1, "rating-only anonymous review saved");
  ok(await page.locator(".review").first().getByText("명동손님").isVisible(), "empty nickname shows 명동손님");

  // §139 localization: no horizontal overflow / ticker wrap in any locale
  for (const l of ["ko", "en", "ja", "zh-cn"]) {
    for (const path of ["", "/rankings", "/guides", `/stalls/${spicy}`]) {
      await page.goto(`${BASE}/${l}${path}`, { waitUntil: "networkidle" });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 0, `${l}${path || "/"}: no horizontal overflow`);
    }
    await page.goto(`${BASE}/${l}`, { waitUntil: "networkidle" });
    const lines = await page.locator('.ticker__item[data-state="active"]').evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && getComputedStyle(el).whiteSpace === "nowrap");
    ok(lines, `${l}: ticker stays on one line`);
    const titleClipped = await page.locator(".header__title").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    ok(!titleClipped, `${l}: service name not truncated in header`);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/ko`, { waitUntil: "networkidle" });
  ok((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(18, 20, 23)", "dark mode uses #121417 background");
  ok((await page.locator("ins.adsbygoogle, [data-ad-position]").count()) === 0, "no ads on the map");

  ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  console.log(`\nALL ${step} PUBLIC ACCEPTANCE CHECKS PASSED`);
} finally {
  await browser.close();
}
