# Security model

## Principles
1. **No service-role / secret key anywhere in the app.** `src/lib/server/env.ts` refuses to start if any `*SERVICE_ROLE*` / `*SUPABASE_SECRET*` variable is set. The browser only ever sees `NEXT_PUBLIC_SUPABASE_URL` and the anon/publishable key.
2. **RLS on every table** (`0002_security.sql` enables it in a loop over `pg_tables`). API roles start with **no** table privileges.
3. **All writes go through `SECURITY DEFINER` RPCs** that validate input and authorization. Admin RPCs call `private.require_role(...)`; public RPCs call `private.require_server(secret)`.
4. **Least privilege for the public.** `anon` has no table access at all. Public reads are viewport/slug-scoped RPCs (`public_map_stalls` refuses bounding boxes > ~3 km) — there is no export-everything endpoint (§130).

## Admin authentication & authorization
| Layer | Mechanism |
|---|---|
| Identity | Supabase Auth (email + password), session cookies via `@supabase/ssr`. `getUser()` verifies the JWT with Supabase on every admin request. |
| Explicit authorization | `public.admin_profiles(user_id, role owner/admin/field_worker, is_active)`. A valid Supabase account without an active profile gets nothing; `/api/admin/login` signs such users out. |
| Role hierarchy | owner > admin > field_worker. Field workers can register/patrol/edit menus/draw lines; merges, spot status and route removal need admin. |
| MFA (ready) | TOTP via Supabase MFA (`/admin/security` enroll, login challenge step). Set `update app_settings set require_mfa = true;` and every admin RPC requires `aal = aal2` (tested in `supabase/tests/01_field_and_security.sql`). Enable before production launch. |
| Gatekeeping | `middleware.ts` refreshes sessions and redirects unauthenticated `/admin/*`; route handlers re-check; the database re-checks on every RPC (defence in depth). |

Granting a role (run as owner in the SQL editor — intentionally not exposed in the UI):
```sql
insert into admin_profiles (user_id, role, display_name)
select id, 'field_worker', 'Kim' from auth.users where email = 'field@example.com';
```

## Public write path
Browser → `/api/public/[fn]` (allowlist, same-origin check, per-IP rate limit, input coercion) → anon-key RPC **plus `MSM_SERVER_SECRET`** → DB checks `sha256(secret)` against `app_settings.server_secret_hash`, resolves the anonymous device, applies a per-device rate limit (`private.rate_limit`, shared across instances) and writes.
- Anonymous device = random 32-byte token in an httpOnly cookie; only its sha256 is stored. No fingerprinting; IP is only used for rate limiting (never "1 IP = 1 user").
- One active spice vote per device per item; one photo vote per device per photo; ≤1 review per stall per device per hour, ≤20/day.
- Reports and reviews are evidence; they never overwrite canonical data.

Set the secret (production):
```bash
openssl rand -hex 32   # → MSM_SERVER_SECRET in the hosting env (server-only)
```
```sql
update app_settings set server_secret_hash = encode(sha256('<that value>'::bytea), 'hex');
```

## Rate limiting
| Endpoint | Limit |
|---|---|
| `/api/admin/login` | 10 / 15 min per IP **and** 5 / 15 min per account (plus Supabase Auth's own limits) |
| `/api/admin/mfa` | 10 / 5 min per IP |
| `/api/admin/rpc/*` | 300 / min per IP |
| `/api/public/*` reads | 30–90 / min per IP per endpoint |
| `/api/public/*` writes | 6–30 / min per IP + DB per-device limits |

The in-process limiter is per instance. In production put Cloudflare WAF rate-limiting rules in front of `/api/*` (and optionally Turnstile on review/report forms).

## CSRF, headers
Cookie-authenticated POSTs require a same-origin `Origin` header. Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`; `/admin` and `/api` are `noindex` and `no-store`.

## Soft deletion & audit
- API roles have **no DELETE privilege**. Stalls, menu items, display lines, landmarks, reviews, photos and dietary claims use `deleted_at`; spots use lifecycle status (`retired`, `merged_duplicate`); stall–spot assignments end with `ended_at`. Removed menu items keep their price history.
- `private.audit()` triggers on all important tables write `audit_logs(actor_id, action, table, row_id, old, new, at)`. Owners/admins can read it.

## Backups (required before production launch)
1. **Supabase plan with daily backups + Point-in-Time Recovery** enabled for the production project.
2. **Independent logical backups** you control: `scripts/backup.sh` (pg_dump custom format, schema + data, `auth` excluded by default) run daily from a trusted machine/CI with `DATABASE_URL` from a secret store; copy to separate storage (e.g. Cloudflare R2 with object lock / versioning). Keep ≥30 days.
3. **Restore drill** before launch and quarterly: restore the latest dump into a scratch database (`pg_restore --clean --no-owner -d <scratch> backup.dump`), run `npm run db:test`-style checks and spot-check M numbers and observation counts.
4. Never commit dumps; they contain operational data.

## Local development mode
`MSM_LOCAL_DB_URL` lets the app run against plain local Postgres (`scripts/local-db.sh`, with `supabase/local-shim.sql` providing `auth.uid()` and roles) using the *same* RPCs, roles and RLS. It uses a signed-cookie dev login and is **hard-disabled when `NODE_ENV=production`** (the server throws). `supabase/seed.sql` / `seed-demo.sql` are dev fixtures only — never apply them to production.

## Pre-launch checklist
- [ ] `require_mfa = true` and every admin enrolled in TOTP
- [ ] `MSM_SERVER_SECRET` set; hash stored; `MSM_LOCAL_*` unset in production
- [ ] Supabase Auth: disable public sign-ups; strong password policy; email confirmation
- [ ] PITR enabled; `scripts/backup.sh` scheduled; restore drill done
- [ ] Cloudflare WAF rate-limit rules on `/api/*`
- [ ] Google Maps key restricted by HTTP referrer and to the Maps JavaScript API
- [ ] Review `audit_logs` access and retention
