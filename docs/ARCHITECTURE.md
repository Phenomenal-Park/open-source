# Architecture

```
Browser (mobile-first Next.js UI)
  │  same-origin fetch
  ▼
Next.js server (App Router) on Cloudflare Workers via OpenNext (wrangler.jsonc, open-next.config.ts)
  ├─ /api/public/[fn]   allowlist → anon key + server secret ─┐
  ├─ /api/admin/rpc/[fn] allowlist → caller's Supabase JWT ───┤
  ├─ server components  → public RPCs (SSR for SEO) ──────────┤
  ▼                                                            ▼
Supabase Postgres: RLS everywhere · SECURITY DEFINER RPCs · audit triggers
```

The database is the system of record **and** the business-logic boundary: M allocation, the single-transaction field save, route/O generation, projection onto display lines, merges, ranking confidence, vote rules and rate-limit backstops all live in SQL (`supabase/migrations`). The same SQL runs on Supabase in production and on local Postgres in development/tests (`src/lib/server/db.ts` has two adapters behind one `rpc()` call; the local one sets the same roles and JWT claims so RLS is exercised for real).

## Data model (Spot / Stall / Observation)
| Table | Purpose |
|---|---|
| `spots` | Physical position. `m_number` (unique, allocated by `spot_number_allocator` under a row lock), `raw_lat/raw_lng` (never overwritten), derived `display_line_id/display_progress/display_lat/display_lng`, hint (`hint_landmark_id`, `hint_relation`, `hint_verified`, `hint_text_i18n`), lifecycle `status`, `merged_into_spot_id`. |
| `spot_location_history` | Every coordinate a spot has had. |
| `stalls` | Seller unit: `slug`, `category_code`, nullable `official_name`, `hours_mode/hours_source`, `representative_photo_id`, soft delete. |
| `stall_localizations` | Per-locale optional display name/description. |
| `stall_spot_assignments` | Occupancy history; one open assignment per spot (`ended_at is null`). |
| `observations` | INITIAL / SAME / CHANGED / NO_STALL / UNCERTAIN at a spot and time; `client_request_id` makes field saves idempotent. |
| `stall_menu_items` | Unlimited normalized items: price type/amount/min/max, `operator_spice_level` + `spice_source`, order, representative (unique per stall), soft delete. |
| `price_observations` | Price history. |
| `normalized_items` | Multilingual concepts + synonyms (`search_terms`) → search, menu translation, `/food/[slug]`. |
| `categories` / `subcategories` / `tags` | 5 categories (palette + dark palette), ≤10 public subcategories each, cross-category tags (seafood). |
| `area_default_hours` / `weekly_hours_overrides` | Area defaults inherited by `hours_mode = DEFAULT`; minutes with `close_min` up to 2880. |
| `patrol_routes` / `patrol_route_spots` | Ordered route; O numbers are `row_number()` over `order_position`, never stored. |
| `stall_display_lines` | Sidewalk-edge polylines (`path` = `[[lat,lng],…]`). Two-sided streets share `street_group` with `side` left/right, generated from `center_path` + `width_m` by `private.offset_path`. |
| `landmarks` | Curated map labels and hint anchors (name + short name per locale, priority). |
| `menu_spice_votes`, `photos`, `photo_votes`, `reviews`, `review_translations`, `reports`, `payment_observations`, `dietary_claims`, `anonymous_devices` | Community evidence. |
| `admin_profiles`, `audit_logs`, `app_settings`, `rate_limit_buckets` | Security/operations. |

## RPC map
Field/admin (authenticated + admin profile): `field_status`, `field_map`, `field_nearby_spots`, `field_route`, `field_create_spot`, `field_record_observation`, `field_apply_change`, `admin_get_stall`, `admin_update_stall`, `admin_route_move/insert/remove`, `admin_set_spot_status`, `admin_merge_spots`, `admin_save_display_line`, `admin_delete_display_line`, `admin_whoami`.

Public (server secret): `public_reference`, `public_map_stalls` (bbox), `public_stall`, `public_rankings`, `public_search`, `public_food`, `public_sitemap`, `public_nearby_stalls`, `public_spice_vote`, `public_photo_vote`, `public_submit_review`, `public_submit_report`, `public_cache_review_translation`.

## Map & markers
- `src/components/map/MapView.tsx`: one component, two backends with the same projection API — **Google Maps JS** (quiet style hiding business POIs, `clickableIcons:false`) and a **schematic Web-Mercator canvas** used when no API key is configured (local dev/tests). Overlays (markers, callout, user dot, field tools) are React elements positioned with the backend's projection.
- Marker size = 10 m ÷ metres-per-pixel (3–32 px), so squares scale with the streets.
- `src/lib/map/layout.ts`: projection to display lines happens in SQL (`private.project_spot`, nearest active line within 30 m) → client converts progress (m) to screen distance along the line → **minimum-displacement spacing along the tangent** (pool-adjacent-violators on `s_i − i·d`) → shrink markers first when the required shift is large → place on the polyline, unrotated. Spots without a line render at their raw position.
- Field Mode shows **raw** positions while registering/patrolling (field truth) and the **public layout** while editing display lines.

## i18n
`src/lib/i18n/config.ts` is the locale registry (`vi` present, disabled). UI strings: `messages/<locale>.ts` typed against `ko` (a unit test enforces identical keys). Data: jsonb `*_i18n` maps and `stall_localizations`, read through `pick()` with fallback locale → en → ko. Menu names show the operator's typed name in Korean and the normalized concept name elsewhere. Adding Vietnamese: enable in the registry, add `messages/vi.ts` + guide content, add `vi` keys to reference data — no schema or route changes.

## SEO
SSR pages per locale with canonical + hreflang (`src/lib/seo.ts`), `sitemap.ts` (stall `lastmod` = `updated_at`), `robots.ts` (disallows `/admin`, `/api`), conservative JSON-LD (name/geo/address only — no fabricated ratings/hours/official names). `/[locale]/map` canonicalizes to `/[locale]`. Filters are client state, never indexable URLs.

## Ads
`src/components/public/AdSlot.tsx` — positions `ranking-mid`, `ranking-lower`, `guide-bottom`, `guide-article`, `stall-lower`, `reviews-mid`. Renders nothing unless `NEXT_PUBLIC_ADS_ENABLED=true` (`NEXT_PUBLIC_ADS_PREVIEW=true` shows labelled placeholders for layout review). There is no slot on the map, callout or bottom sheet.
