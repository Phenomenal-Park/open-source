# Implementation status (spec v5.0)

Legend: ✅ implemented & tested · 🟡 implemented, needs real-world/production validation · ⬜ not started (later phase)

## Phase 1 — Foundation
- ✅ Next.js 15 + TypeScript app, Supabase/Postgres schema (5 migrations), docs
- ✅ Cloudflare Workers hosting via OpenNext (build + Worker runtime preview tested locally, 1.26 MB gzip); not yet deployed to a real Cloudflare account
- ✅ Admin auth: Supabase Auth + `admin_profiles` roles + MFA-ready (TOTP enroll/verify, `require_mfa` → AAL2 enforced in DB)
- 🟡 Google Maps base (implemented; not exercised here because Maps is unreachable from the build sandbox — schematic fallback used for tests)
- ✅ Localization structure (ko/en/ja/zh-cn; vi registered, disabled)

## Phase 2 — Field-Ready Alpha (P0, §132)
- ✅ `/admin/field` mobile layout, current location (watchPosition, follow mode)
- ✅ Single-tap candidate, draggable / re-tap adjust, M preview, DB-safe M allocation (row lock; concurrency test: 50 parallel saves, unique & gapless)
- ✅ 5 categories, 5 default rows, unlimited `+ 상품 추가`, removable rows, numeric price + formatting, optional per-item spice, first item representative
- ✅ Optional landmark hint (nearest landmark suggested, always "근처")
- ✅ Default hours + custom hours editor (midnight-safe)
- ✅ Single-transaction save: spot, stall, assignment, observation, menu, prices, spice, hours, route insertion, O order; idempotent retry
- ✅ Patrol: 그대로 / 변경 / 오늘 없음 / 확인 어려움, auto-advance, change sheet (menu/price/spice/hours/category/hint/new occupant), observation history
- ✅ Duplicate proximity warning (blocks save until acknowledged), merge
- ✅ Streets with stalls on both sides: draw centre line + width → left/right display lines (SQL `admin_save_street`), single-side lines too; drag vertices, undo, delete; automatic re-projection
- ✅ Marker size scales with the map (≈10 m per square, 6–22 px, one uniform size per view); squares never overlap (layout + final collision pass, unit- and E2E-tested) and sit inside the street in two rows (one centre row when the street is too narrow on screen)
- ✅ Rounded-square marker rendering
- ✅ Route management page (drag/↑↓/move-to/insert-after/remove)

## Phase 3 — Public map
- ✅ Header, one-line ticker with two click zones, utility filters (영업 중 / 가격 / 할랄 / 카드), multi-select category chips + ≤10 subcategories (OR within, AND across), filter bottom sheet with price bands and live count
- ✅ Magnetic marker layout along display lines; default/match/muted/selected states; compact callout; compact bottom sheet
- ✅ Search (multilingual synonyms → normalized concepts, broadened not fabricated)
- ✅ Light/dark mode (spec palette), language switch + persistence
- ✅ "Rate a stall you visited": GPS proposes nearest ≤6, user chooses

## Phase 4 — Content pages / SEO
- ✅ Stall detail (tabs, menu with chilis, community spice, hours, payment, dietary, reviews, photos, report, directions)
- ✅ Ranking page (TOP 20 + category TOP 3, Bayesian-corrected 7-day ratings), Guides (7 practical guides × 4 languages), Food pages
- ✅ hreflang/canonical, sitemap, robots, localized meta/OG, conservative JSON-LD

## Phase 5 — Community
- ✅ Anonymous reviews (rating-only minimum, optional sub-ratings/facts/text/nickname), spice votes, photo votes, reports
- 🟡 Review translation: schema, cache RPC and "View original" UI done; **no translation provider is wired** (`TRANSLATION_PROVIDER` unset → originals shown)
- ⬜ Photo **upload** (public and field). Schema, display, voting and representative pinning exist; storage upload flow (Supabase Storage or R2) is not built yet.
- ⬜ Item-level ranking TOP 3 on the ranking page (food pages list stalls per item instead)

## Planned next (operator)
- ⬜ Restrict the public map to the Myeongdong stall area: no panning outside it (map bounds + min zoom). Requested 2026-11-12, not yet implemented.

## Phase 6–7 and later
- ⬜ Confidence scoring, exception queue, owner claims, trusted contributors, report-review UI, review/photo moderation UI, translation management UI, category management UI
- 🟡 AdSlot components placed (disabled); AdSense/affiliate wiring later
- ⬜ Vietnamese, Food Battle, tourist POIs

## Known limitations / decisions
- Admin UI is Korean-only (the field mockup shows a language selector; admin localization was deferred to keep P0 focused).
- Ranking requires ≥3 reviews in the last 7 days per stall (confidence floor); with little data the ticker shows "이번 주 평가를 모으고 있어요".
- English header: on screens < 430 px the language button shows only the globe icon so the service name isn't truncated (§6: shorten before shrinking).
- Spice prompts are hidden on dessert/fruit items marked not-spicy to avoid clutter.
- Landmark coordinates and the dev demo street geometry are approximate.

## Mockup deviations (spec overrides mockup)
- zh mockup's `¥5,000` → `₩5,000`. Guide colour legend uses the spec palette. Trash wording follows §110 (no promise that every stall must accept trash). Menu rows are optional (only coordinate + category required, §88). Field sheet buttons are `취소` / `저장 →` per §87; per-row spice toggle added per §92.
