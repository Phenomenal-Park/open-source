# Field operations guide (`/admin/field`)

## Before the first survey
1. Verify the 9 seeded **landmark coordinates** on site (`landmarks` table — they are approximate). Fix any that are off; hints are generated from them.
2. Draw the stall streets (mode 표시선 → **길 그리기 (양쪽 노점)**): tap along the **middle of the street**, set the width with the slider (the two blue lines should sit on the stall rows), save. Both sidewalk rows are created at once. Use **한쪽 선만** for a street with stalls on one side only. Stop a street before intersections so rows don't run through the crossing. Saving re-projects all spots automatically, and streets can be drawn before or after registering stalls.
3. Log in on the phone, enable location when prompted by tapping the locate button.

## 현장 등록 (initial registration) — the 200+ spot loop
Walk → see stall → **tap its position on the map** → choose category → type visible products/prices (rows 1–5, `+ 상품 추가` for more) → optional spice tap per row → leave the suggested landmark hint (or ×) → leave hours → **저장** → keep walking.
- `다음 M-042` is a preview; the database assigns the number at save time. Cancelling never consumes a number.
- Tap again or drag the red candidate to adjust its position. Correct neighbour order matters more than exact coordinates.
- If `근처 등록 위치` appears, you're within 8 m of an existing spot: pick **기존 위치 선택** if it's the same place, or **새 위치 등록** if it's genuinely a different stall position (stalls can be 1–2 m apart).
- Missed a spot between two others? Tap the earlier spot → **이 다음에 추가**, then register the missed one; it gets the next M number but its O-order is inserted in the right place.
- Saving on a flaky network is safe to retry: each draft has a request id, so a repeated save never creates a duplicate.
- Retail stalls hide the spice control.

## 순찰 (patrol)
`O-043 / 224` is the walking order. For each spot: **그대로** (same stall, auto-advance), **오늘 없음** (no stall right now — the spot stays active), **확인 어려움** (can't tell — never guess), or **변경** (menu/price/spice/hours/category/hint changes, or "다른 노점으로 바뀜" for a new occupant). All history is kept.

## Route order (`/admin/route`)
Drag (desktop), ↑/↓, or 이동 to a number; 제외 removes a spot from the active route (admin). O numbers regenerate automatically; M numbers never change.

## Spot management (`/admin/spots`)
Change lifecycle status (dormant, temporarily blocked for construction, retired) and merge duplicates (`M-244 → M-073`). Merging moves observations/occupancy/reports/photos and keeps the duplicate's M number retired forever.

## Stall editor (`/admin/stalls/[id]`)
Change the representative item, price types (fixed/range/varies/unknown), per-item spice, custom hours, localized display names, the official name (**only if actually confirmed**), and — only after on-site verification — a strong location relation (앞/맞은편/옆).

## Things that need real-world tuning (not testable from a desk)
GPS accuracy between tall buildings, dense adjacent spots, display-line placement, marker spacing at real street widths, walking speed of patrol, ergonomics over 200+ registrations.
