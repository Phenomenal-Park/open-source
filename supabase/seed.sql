-- ⚠️ LOCAL DEVELOPMENT DEMO DATA ONLY — NEVER APPLY TO PRODUCTION.
-- Creates a local dev owner account and the local server secret. Demo stalls are in seed-demo.sql.
-- Real data comes only from the field survey (/admin/field).
-- Street geometry is a rough approximation, not surveyed.

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'dev-owner@localhost')
on conflict do nothing;
insert into public.admin_profiles (user_id, role, display_name) values ('00000000-0000-0000-0000-0000000000aa', 'owner', 'Local dev owner')
on conflict do nothing;
-- sha256('local-dev-server-secret') — matches MSM_SERVER_SECRET in .env.local.example
update public.app_settings set server_secret_hash = encode(sha256('local-dev-server-secret'::bytea), 'hex');

