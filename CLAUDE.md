# Instructions for Claude / AI contributors

1. **`docs/SPEC.md` (spec v5.0) and the approved mockups are the only source of truth.** Written spec = meaning/behaviour; mockups = visual hierarchy/density/appearance. Check `docs/STATUS.md` for what exists.
2. **SIMPLE IS THE BEST.** Sophisticated backend, simple public UI and field workflow. Before adding anything, apply the §147 test (helps tourists find/understand/choose a stall, substantially improves data maintenance, or sensible monetization without hurting those). Otherwise don't add it.
3. **Never remove or simplify away:** Spot/Stall/Observation separation, UUID keys, DB-allocated M numbers (never typed, renumbered or reused), route-derived O numbers, normalized menu items, default-hours inheritance, Stall Display Lines with raw coordinates preserved.
4. **Never show** M/O numbers publicly, a favorite heart, ads on the map/callout/sheet, fabricated ratings/hours/official names/structured data, or "Myeongdong Street Food Map" as the visible title.
5. **Self-correction is allowed for objective defects and clear mockup mismatches — toward the mockup.** Redesign is not (no new concepts, sections, cards, gradients, colours, marker shapes, nav or ticker changes).
6. **Security:** never introduce a service-role/secret key into the app; all writes go through `SECURITY DEFINER` RPCs that check `private.require_role` / `private.require_server`; RLS on every new table; soft delete + audit triggers for operational tables; rate-limit new endpoints. See `docs/SECURITY.md`.
7. **Business logic lives in SQL** (`supabase/migrations`). Add a new migration file; don't edit applied ones. Add SQL tests in `supabase/tests`.
8. Localization: no mechanical translation; shortest natural wording per language; every UI string in all `src/lib/i18n/messages/*` (a unit test enforces matching keys). Design for future `vi`.

## Commands
- `npm run db:local` / `npm run db:local:empty` — local Postgres with demo data / empty (dev admin `dev-owner@localhost` / `local-dev-password`)
- `npm run dev`, `npm run typecheck`, `npm test`, `npm run db:test`, `npm run test:e2e:field`, `npm run test:e2e:public`, `npm run build`

## Workflow
Implement → typecheck/build → run the relevant tests → compare to spec → compare to mockups (phone viewport 390×844) → fix objective problems → retest. Report honestly: never claim something was tested if it wasn't.
