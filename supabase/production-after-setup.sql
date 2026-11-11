-- Run in Supabase → SQL Editor AFTER production-setup.sql.
-- Replace the two placeholders, then Run.

-- 1) Server secret: paste the SAME random value you put into the hosting env var MSM_SERVER_SECRET.
update public.app_settings
set server_secret_hash = encode(sha256('PASTE_MSM_SERVER_SECRET_HERE'::bytea), 'hex');

-- 2) First owner: create the user first in Authentication → Users → Add user (email + password),
--    then put that email here.
insert into public.admin_profiles (user_id, role, display_name)
select id, 'owner', 'Owner' from auth.users where email = 'PASTE_OWNER_EMAIL_HERE';

-- Check: should return one row with role = owner
select u.email, p.role from public.admin_profiles p join auth.users u on u.id = p.user_id;
