# 명동 노점 지도 · Myeongdong Street Map

A continuously updated, multilingual (ko / en / ja / zh-CN) map of Myeongdong street stalls — food **and** retail — with per-item prices and spice levels, opening hours, ratings and a phone-first field tool for the people who keep the data fresh.

**Source of truth:** [`docs/SPEC.md`](docs/SPEC.md) (spec v5.0) + the approved mockups ([`docs/mockups/`](docs/mockups/)). Status: [`docs/STATUS.md`](docs/STATUS.md).

| Doc | |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | data model (Spot / Stall / Observation), RPCs, map/marker pipeline, i18n, SEO |
| [SECURITY](docs/SECURITY.md) | auth/MFA, RLS, secrets, rate limits, soft delete & audit, **backups**, pre-launch checklist |
| [FIELD_OPERATIONS](docs/FIELD_OPERATIONS.md) | how to run the survey and patrols |

Stack: Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth) · Google Maps JavaScript API.

## Local development (no Supabase project needed)
Requires Node 20+ and PostgreSQL 16 binaries (`/usr/lib/postgresql/16/bin` or set `PGBIN`).
```bash
npm install
cp .env.local.example .env.local
npm run db:local          # local Postgres + migrations + dev admin + DEMO stalls
npm run dev               # http://localhost:3000  ·  admin: /admin/login (dev-owner@localhost / local-dev-password)
```
Without `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` the map falls back to a simplified schematic map (same markers and tools). Local mode runs the exact production SQL (RLS, roles, RPCs) and is refused when `NODE_ENV=production`.

## Tests
```bash
npm run typecheck && npm test        # TypeScript + unit tests (hours/midnight, prices, locales, marker layout)
npm run db:test                       # SQL acceptance + security + M-number concurrency tests
npm run db:local:empty && npm run test:e2e:field    # §135/§136 field acceptance via the real UI (needs `npm run dev`)
npm run db:local && npm run test:e2e:public         # §137–§139 public acceptance (needs `npm run dev`)
```
E2E scripts use Playwright (`npm i -D playwright` if it isn't installed globally).

## Production setup (Supabase)
1. Create a Supabase project; **disable public sign-ups** in Auth settings.
2. Apply `supabase/migrations/*.sql` in order (SQL editor or `supabase db push`). Do **not** apply `local-shim.sql`, `seed.sql` or `seed-demo.sql`.
3. Generate a server secret (`openssl rand -hex 32`), set `MSM_SERVER_SECRET` in the hosting environment and store its hash:
   `update app_settings set server_secret_hash = encode(sha256('<secret>'::bytea), 'hex');`
4. Create admin users in Supabase Auth, then grant roles: see [SECURITY → Admin](docs/SECURITY.md#admin-authentication--authorization).
5. Set env from `.env.example` (anon key only — never a service-role key). Restrict the Google Maps key by referrer.
6. Enroll TOTP for every admin at `/admin/security`, then `update app_settings set require_mfa = true;`.
7. Enable PITR and schedule `scripts/backup.sh`; do a restore drill (see SECURITY.md).
