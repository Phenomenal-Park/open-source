# Myeongdong Street Map — Master Specification v5.0 (condensed, authoritative)

> **This file + the approved mockups are the only current source of truth.** If older docs, code comments,
> experiments or conversations conflict with this, this wins unless the operator changes a decision.
> Written spec controls **meaning and behaviour**; mockups control **visual hierarchy, density, layout and appearance**
> (do not copy image-generation typos). Section numbers (§) match the original v5.0 document.

**Principle: SIMPLE IS THE BEST.** The backend may be sophisticated; the public UI and the field workflow must feel simple.

## Product (§1–§3)
- The most useful continuously updated map of Myeongdong street stalls — **food and retail** (clothing, hats, socks, accessories, toys, souvenirs, misc).
- Tourists must quickly learn: where stalls are, what they sell, prices, spiciness (per item), likely open, location vs. landmark, ratings, freshness, how to get there.
- The moat is **continuously refreshed real-world field data**, not code.
- Internally: Spot/Stall/Observation, UUIDs, M/O numbers, routes, history, translations, confidence, normalization, price history, spice opinions, reports. **Tourists never see any of this.**
- Names: KO **명동 노점 지도**, EN **Myeongdong Street Map** (never the visible title "Myeongdong Street Food Map"). SEO title may be longer, e.g. "Myeongdong Street Map – Street Food, Shopping & Stalls". JA/ZH concise, natural, not food-only. Temporary wordmark only.

## Languages & localization (§4–§7)
- Locales `ko`, `en`, `ja`, `zh-CN` (routes `/ko /en /ja /zh-cn`); `vi` must be addable without route/schema/review/guide/menu redesign.
- First visit: saved manual choice → browser language → English. Manual choice overrides and persists.
- Do not mechanically translate; use the shortest **natural** wording per language; shorten wording before shrinking fonts.
- Everything public is localizable (nav, filters, categories, stall info, hints, menu names, hours, spice labels, ranking, guides, reviews, comments, reports).
- UGC stores `original_language`, `original_text`, translation cache. Show translation in the UI language by default with **View original**; never both by default.

## Location hints (§8)
- Default form: landmark + broad relation — 유니클로 근처 / Near UNIQLO / 优衣库附近 / ユニクロ付近.
- Strong relations (앞, 바로 앞, 옆, 맞은편, in front of, opposite) **only when intentionally verified**. Uncertain → 근처/Near.

## Public navigation & visual direction (§9–§15)
- Top-level nav small: **지도 · 랭킹 · 가이드**, plus Search and Language/settings. No "최신정보" page — freshness comes from timestamps, verifications, reports, status, price confirmations.
- Mobile-first (tourist walking with a phone). Desktop expands the same product.
- Calm, clean, modern, obvious, fast, map-first, restrained. No generic SaaS/travel portal, card-heavy UI, purple-heavy or neon look.
- Light: white/off-white/subtle gray, dark neutral text. Dark mode for eye comfort: bg `#121417`, card `#191C21`, secondary `#20242A`, text `#E8EAF0`, muted `#9CA3AF`, border `#2B3038`; no neon/glow/gradients/medal colours; soften category colours.
- Five major categories exactly: **튀김·분식 `#E65454`, 꼬치·구이 `#F28A30`, 간식·스낵 `#2A9D8F`, 디저트·과일 `#D95C9F`, 패션·잡화 `#625CCB`**. No standalone 음료 (juice → 디저트·과일) or 해산물 (seafood is a cross-category tag). Internally distinguish `food` / `retail`.

## Filters & search (§16–§18)
- Max 10 public subcategories per category (prefer 6–8). Detailed items stay searchable, not filters.
- Within a group: OR. Across groups: AND. No subcategory selected → whole category.
- Search understands detailed multilingual terms mapped to normalized concepts. **Never fabricate** (don't claim a stall sells mango juice if only "fresh juice" is known; broadened results OK).

## Main map (§19–§25)
- Structure: compact header → one-line ranking ticker → essential utility filters → five category controls → large map → selected-stall callout → compact bottom sheet. Map is most of the screen. No permanent big cards, TOP3 blocks, editorial copy, map ads, favorite heart, or unrelated POIs.
- Ticker: fixed `이번 주 평점 랭킹 ›` + rotating `1위 딸기모찌 · 유니클로 근처 · ★ 4.8`, 1→5 every ~5 s, vertical upward animation, **one line, never wraps** (ellipsis), no 1/5, dots, crowns, medals or big coloured box. Item name stronger than hint.
- Label click → Ranking page. Entry click → **that Stall's detail page** (not a map filter).
- "평점" ranking = ratings (rolling 7 days). "인기" only if genuinely engagement-based. Never raw average; use confidence correction (Bayesian etc.); never expose formula.
- Ranking page: TOP ~20 overall, category TOP 3, item TOP 3; neutral copy "최근 7일 이용자 평가 기준"; no long bottom lists; rows: rank, image, name, hint, ★, count, representative price, detail affordance; plain numbers, yellow ★ fine. Future ads after ~rank 3–5 and lower, clearly labeled, never styled as entries.

## Markers & display lines (§26–§37)
- All stall markers are **rounded squares** (never circles/pins/teardrops/diamonds). Upright (never rotated).
- States: default = visible but muted; filter match = vivid/full colour/optionally larger/stronger border; non-match = visible but muted; **one** selected stall = strongest. Never highlight a whole street. Real streets are category-mixed.
- **Stall Display Lines**: admin-drawn polylines along the sidewalk/stall edge (not road centrelines). Spots keep `raw_lat/raw_lng` forever; derived `display_line_id/progress/lat/lng`. Pipeline: raw → line → projection → collision adjustment **along the tangent** → render. Don't push into roads/across streets/into buildings.
- Dense: shrink → reduce spacing → remove detail → small along-line displacement. Sizes: very far 3–5, far 6–8, normal 10–14, close 16–20, very close 20–24 px; spacing 1–2 / 3–4 / ~5 / 5–6 px.
- Landmark priority: user location > selected/matching stalls > other stalls > major landmarks > ordinary Google POIs.

## Stall presentation (§38–§48)
- Callout: small `[photo] 딸기모찌 유니클로 근처 ›`. Bottom sheet: name · hint, ★ (count), 대표 메뉴 + price, 기타 메뉴, [상세 보기]. No public M/O. No favorite in MVP.
- Naming: `official_name` (nullable, never invented), `display_name`, `location_hint`. "딸기모찌 · 유니클로 근처" is a display label, not a legal name.
- Detail priority: name, hint, open info, rating, menu/prices, spice, weekly hours, payment/dietary, reviews, photos. No giant empty image placeholder. Tabs `[가격·메뉴] [리뷰] [사진]`, default 가격·메뉴.
- A stall sells any number of items. Show ~3–5, then "+ 메뉴 N개 더보기" inline/sheet (no extra route).
- Price types: FIXED, RANGE, VARIES, UNKNOWN (unknown beats fake precision).
- Spice is **per menu item**, custom red chili SVG (no OS emoji), 0 = 안 매움, 1–3 chilis; copy: 살짝 매콤 / 꽤 매움 / 매운맛을 좋아하는 분께 추천; subjective, not scientific.

## Spice data (§49–§52)
- `operator_spice_level` 0–3 or null + source (FIELD_OBSERVED, SELLER_CONFIRMED, MENU_SIGN, ADMIN, UNKNOWN). Store semantics, not icons.
- Users vote per menu item without login: one active vote per anonymous device per item; change/remove allowed. Votes never overwrite operator value; community shown as simple 0–3 (median), e.g. "이용자 체감 🌶🌶 · 34명"; show both when they differ strongly. Spice filter: store now, add publicly only if needed.

## Hours (§53–§57)
- Every new stall defaults to Mon–Fri 16:00–24:00, Sat–Sun 13:00–24:00, all open — area defaults, **not** individually verified.
- `hours_mode` DEFAULT/CUSTOM; source AREA_DEFAULT, FIELD_VERIFIED, OWNER_CONFIRMED, USER_REPORTED, ADMIN.
- Admin UI: collapsed "기본값 사용 월–금 16:00–24:00 토–일 13:00–24:00 [수정]" → per-day open/closed/start/end + [기본값으로 되돌리기].
- Midnight: show 24:00; store safely (1440 minutes); 16:00–00:00 never means closing before opening.
- Public: "일반 영업시간 … (명동 노점 일반 영업시간 기준)"; verified custom hours override.

## Location & community (§58–§67)
- No location prompt on load. Tap 내 위치 → explain → permission → watchPosition → live dot, accuracy, optional heading, distances. Follow mode; manual pan disengages; button resumes.
- Visited flow: GPS proposes nearest 4–6 stalls, **user chooses**; quick contribution in ~20–30 s.
- Reviews: no account/login/profile/avatar; empty nickname → 명동손님 (localized). Minimum = overall stars; optional 맛/가성비/친절도, facts (가격 맞음/다름, 카드 가능, 현금, 영업 중), text, photo. Spice opinions attach to menu items. Framing: "Help the next traveler"; don't over-gamify.
- Anonymous random device id (no fingerprinting); IP only as an anti-abuse signal, never 1 IP = 1 user.
- Photos: food/product/exterior/menu board/price board; avoid people. Optional in field. Voting 👍/👎, one active vote per device, same again removes, opposite switches; votes = usefulness, not rating. Hero candidates: food/product/exterior; admin can pin.
- Reports are observations/evidence, never direct overwrites; multiple matching → confidence; conflicts → admin review; keep history.

## Core data model (§68–§81) — NON-NEGOTIABLE
- **Spot** (physical position) / **Stall** (seller unit) / **Observation** (what was seen at a Spot at a time). A Spot's occupant can change by day.
- UUID primary keys. **M-number** `M-001…` identifies a Spot, assigned automatically on the first successful save, never typed, never renumbered or reused, allocated concurrency-safely in the database (UI may only preview). Cancelled candidates consume nothing.
- **O-number** `O-001…` = current patrol order, generated from `patrol_routes` / `patrol_route_spots(route_id, spot_id, order_position)`; not stored on the Spot. Admin: drag reorder, insert before/after, remove inactive, regenerate O; later route versions.
- Spot lifecycle: candidate, active, dormant, temporarily_blocked, retired, merged_duplicate. One absence ≠ retired. Small continuous moves update location history; genuinely new location = new M.
- Before saving show nearby Spots (`M-041 · 약 3m … [기존 위치 선택] [새 위치 등록]`); never auto-merge by distance. Merge moves observations/occupancy/reports/photos; duplicate keeps its M as `merged_duplicate`, never reused.

## Field mode (§82–§105)
- `/admin/field`, phone-first, map + fast actions (not CRUD). Initial registration status always visible: 등록 41개 · 다음 M-042 · 기본 시간 적용.
- In add mode a **single tap** on empty map creates a candidate (no long press/wizard/typed coordinates); candidate draggable or 위치 조정. Flow: tap → candidate → sheet → M preview → coordinate prefilled → category/menu → save → permanent marker → sheet closes → next M.
- Required: coordinate + major category. Optional: menu, price, spice, hint. Not required: photo, full menu, official name, owner, card, dietary, custom schedule.
- 5 product/price rows by default; not a limit; `+ 상품 추가` adds inline rows; removable; empty rows create nothing. Numeric keyboard for price, "5000" → 5,000/₩5,000. Optional compact per-row spice (미확인/안 매움/🌶/🌶🌶/🌶🌶🌶). First item = representative (changeable later). Normalized menu records (no product_1/price_1 columns); field data feeds public pages directly.
- One Save = spot + M + stall + assignment + observation + menu + prices + spice + default hours + route insertion + O order. Success = small toast "M-042 저장됨", then 등록 42개 · 다음 M-043. Must be comfortable for 200+ consecutive registrations.
- Patrol: `O-043 / 224`, M smaller, current stall, [그대로] [변경] [오늘 없음] [확인 어려움]. 그대로 records + auto-next; 오늘 없음 = NO_STALL (never deletes); 확인 어려움 records uncertainty. 변경 sheet supports menu/price/spice/schedule/category changes, different occupant, moved, uncertain — no field required. NO_STALL on a day means only that. Never destroy raw history. Field photos auto-attach to spot/observation/time.
- Accuracy priority: correct Spot > neighbour order > approximate coordinate > useful hint.

## Content, dietary, payment, guides, SEO (§106–§113)
- Simple review cards ("명동손님 ★ 4.5 · 2시간 전 …"), no avatars.
- Dietary: certified (evidence), seller claims (unverified), no pork/alcohol confirmed, contains pork/alcohol, vegetarian, unconfirmed — never simplistic yes/no; an attribute/filter, not a category. Payment observations separate from ratings.
- Guides: practical (how to use, hours, card, cash, price check, halal, trash, reporting, finding locations). Trash: ask the stall you bought from or a nearby stall — many accept; don't promise every stall must accept any trash.
- SEO: routes `/[locale]`, `/[locale]/map`, `/[locale]/stalls/[slug]`, `/[locale]/food/[slug]`, `/[locale]/rankings`, `/[locale]/guides(/[slug])`; admin noindex; SSR, stable URLs, hreflang, canonical, sitemap with lastmod, localized meta, OG, internal links, CWV. No indexable filter combinations. Never fabricate ratings/hours/names/structured data.

## Later, monetization, admin, stack (§114–§130)
- Future POIs (exchange, toilets, exits, tourist info) with icons distinct from stall squares; don't recreate Google Maps.
- Utility (map, location, search, filters, directions, core info) stays clean. Content/discovery monetizes. Reusable `<AdSlot position="…" />`, disabled at launch; AdSense baseline; locale-appropriate affiliates (eSIM, hotels, tours…) only where natural. Good places: ranking, guides, long reviews, galleries, lower detail. Never interstitials, popups, ads over map/directions/selected popup, or deceptive ads.
- Vietnamese later without restructuring. Food Battle (명동 음식 월드컵 / Myeongdong Food Battle) later, real photos only, separate from ratings ("선택률", never "평점").
- Admin areas long-term: field, spots, stalls, routes, menu, prices, spice, hours, observations, display lines, reports, moderation, merge, translations, categories, workers, owner claims, audit — no source edits for routine work. Field Mode first; plain admin home. Later exception queue.
- Stack: Next.js, TypeScript, Supabase/PostgreSQL, Google Maps JS API; Cloudflare-friendly (R2, WAF, rate limiting, Turnstile); not locked to Vercel.
- Data moat: no anonymous full export; viewport/bbox queries, pagination, rate limits; protected admin; no bulk CSV/JSON; don't scrape/republish Google data.

## Development order & acceptance (§131–§140)
Phases: 1 Foundation → 2 **Field-Ready Alpha (P0)** → 3 Public Map → 4 Content pages/SEO → 5 Community → 6 Operations → 7 Monetization → Later (vi, Food Battle, POIs).
Acceptance tests §135 (field creation, 28 steps), §136 (patrol), §137 (public map), §138 (menu/spice), §139 (localization), §140 (ads) — automated equivalents live in `tests/`.

## Working rules (§141–§147)
- Implement → build/typecheck → test core flows → compare to spec → compare to mockups → fix objective problems → retest → stop when clean.
- May self-correct objective defects and clear mockup mismatches **toward the mockup**. May **not** redesign: no new concepts, IA changes, new cards/sections, gradients, decorative animation, colour/nav/marker-shape/ticker changes, unrequested features, or removal of Spot/Stall/Observation, M/O, normalization, default-hours inheritance, display lines.
- When unsure visually: least change, simpler, better on mobile, less UI, keep hierarchy.
- Final report: Implemented / Self-corrected / Validated / Remaining limitations / Requires real-world field testing. Never claim untested things were tested.
- Before adding anything: does it help a tourist find/understand/choose a stall, substantially improve data maintenance, or create sensible monetization without hurting those? If none — don't add it.

## Operator decisions after v5.0 (these override the sections noted)
- **2026-11-12 — Streets have stalls on both sides (§31–§35).** A street is drawn once as a centre line + width; the two sidewalk-edge Stall Display Lines (left/right) are generated from it and every spot projects onto its own side, so each street shows two rows. Single-side lines remain available. Raw coordinates are still never modified.
- **2026-11-12 — Marker size scales with the map like the streets (replaces the §36 px table).** A stall square represents ~10 m of street (size = 10 m ÷ metres-per-pixel, clamped 6–22 px — ≈6–8 px zoomed out, 10–14 px normal, 18–22 px zoomed in; gap ≈ 2.5 m, clamped 1–4 px). One uniform size per view (the most crowded street decides). On narrow alleys the two rows stay ≥ 4 px apart, so zooming in/out grows/shrinks markers together with the roads. Dense streets still shrink markers / shift them along the line as in §34.
- **2026-11-12 — Stall squares never overlap each other and never sit on the road.** Two-sided street markers are pushed fully onto the sidewalk (inner edge 1 px off the road edge). The selected stall's larger size is reserved in the layout. If a crowded line can't fit even at the minimum size, lower-priority squares (muted < default < filter match < selected) are hidden at that zoom and reappear when zooming in. Rings are drawn inside the square.
- **2026-11-12 — Category colours made more vivid** for clarity (migration 0008): 튀김·분식 `#EF3B3B`, 꼬치·구이 `#FF9500`, 간식·스낵 `#14B8A6`, 디저트·과일 `#EE5DB5`, 패션·잡화 `#7B61FF` (dark mode slightly softened). Default markers are flat full-colour squares without rings.
- **2026-11-12 — Filter display (operator reference):** with no filter, every stall shows a light tint of its category colour; when a filter is active, matching stalls are full category colour (100%), non-matching stalls are grey at ~30% opacity. The stall being viewed always has a thick white border + shadow (its border space is reserved so it never touches neighbours). Active chips are filled (영업 중/할랄/카드 green, categories in their colour) with a ✓. Several categories can be selected at once (OR).
- **2026-11-12 — Filter sheet:** "가격 ▾" opens a bottom sheet with 음식 종류 (전체 + 5), 영업 상태 (전체/영업 중), 기타 조건 (할랄 가능, 카드 결제 가능), 가격대 (전체, ~3,000, 3,000–5,000, 5,000–10,000, 10,000~), 초기화 and "적용하기 (총 N개 노점 표시)". "임시 휴업" is not offered until the data model records temporary closures.
- **2026-11-12 — Hosting on Cloudflare Workers** (commercial use), via OpenNext.
- **2026-11-12 — Main map visuals tuned to the approved mockup:** Pretendard typeface; ~28 pt filter chips with all five categories on one row; bottom sheet always shows a small photo slot (neutral tile until a photo exists).

## Security requirements (operator addendum)
Admin requires Supabase Auth + explicit owner/admin authorization + MFA-ready architecture; RLS on all mutable tables; never expose secret/service-role keys to the client; public users get only minimum read/write needed; soft deletion and audit logging for important operational data; rate-limited login and mutation endpoints; recoverable backups before production launch. See `docs/SECURITY.md`.
