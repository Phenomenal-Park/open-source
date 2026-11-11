-- Security model (see docs/SECURITY.md)
-- 1. RLS enabled on EVERY table. anon has no direct table access at all (data moat, §130).
-- 2. Admins read tables directly under RLS; all writes go through SECURITY DEFINER RPCs
--    that check admin_profiles (explicit owner/admin/field_worker authorization) and, when
--    app_settings.require_mfa is on, an AAL2 (MFA-verified) session.
-- 3. Public reads/writes go through public_* RPCs that demand the server secret, so the
--    anon key alone cannot bulk-export data or bypass the server's rate limiting.
-- 4. No DELETE privileges for API roles: important data is soft-deleted; changes are audited.

-- ───────────── authorization helpers ─────────────
create or replace function private.current_admin_role() returns public.admin_role
language sql stable security definer set search_path = public, pg_temp as $$
  select ap.role
  from public.admin_profiles ap
  where ap.user_id = auth.uid()
    and ap.is_active
    and (
      not (select require_mfa from public.app_settings where id)
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
$$;

-- Raises unless the caller holds at least the given role. owner > admin > field_worker.
create or replace function private.require_role(min_role public.admin_role) returns public.admin_role
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.admin_role := private.current_admin_role();
begin
  if r is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if (case r when 'owner' then 3 when 'admin' then 2 else 1 end)
     < (case min_role when 'owner' then 3 when 'admin' then 2 else 1 end) then
    raise exception 'insufficient role' using errcode = '42501';
  end if;
  return r;
end $$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select private.current_admin_role() is not null
$$;

-- Server-secret gate for public RPCs.
create or replace function private.require_server(p_secret text) returns void
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare h text;
begin
  select server_secret_hash into h from public.app_settings where id;
  if h is null or p_secret is null or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') <> h then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- Fixed-window rate limit backstop. Raises when more than p_max hits in p_window_seconds.
create or replace function private.rate_limit(p_key text, p_max integer, p_window_seconds integer) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limit_buckets as b (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = b.hits + 1
  returning hits into n;
  if n > p_max then
    raise exception 'rate limited' using errcode = 'P0429';
  end if;
  -- opportunistic cleanup
  if random() < 0.01 then
    delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  end if;
end $$;

-- Resolve (and create on first use) an anonymous device from its raw token.
create or replace function private.device_from_token(p_token text) returns uuid
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare d public.anonymous_devices;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    raise exception 'invalid device' using errcode = '22023';
  end if;
  insert into public.anonymous_devices as a (token_hash)
  values (encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
  on conflict (token_hash) do update set last_seen_at = now()
  returning * into d;
  if d.is_blocked then
    raise exception 'blocked' using errcode = '42501';
  end if;
  return d.id;
end $$;

-- ───────────── audit trigger ─────────────
create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_logs (actor_id, action, table_name, row_id, old_data, new_data)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    coalesce(
      case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id',
      case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'stall_id'
    ),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create or replace function private.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'admin_profiles', 'app_settings', 'spots', 'stalls', 'stall_localizations', 'stall_spot_assignments',
    'stall_menu_items', 'weekly_hours_overrides', 'patrol_routes', 'patrol_route_spots',
    'stall_display_lines', 'landmarks', 'dietary_claims', 'reviews', 'photos', 'reports',
    'categories', 'subcategories', 'normalized_items', 'area_default_hours'
  ] loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function private.audit()', t);
  end loop;
  foreach t in array array['admin_profiles', 'spots', 'stalls', 'stall_menu_items', 'patrol_routes', 'stall_display_lines', 'app_settings'] loop
    execute format('create trigger touch_%1$s before update on public.%1$I
                    for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- ───────────── grants & RLS ─────────────
-- Start from zero: API roles get nothing by default.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Staff can SELECT operational tables directly (admin screens). Writes only via RPC.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
           and tablename not in ('app_settings', 'rate_limit_buckets', 'anonymous_devices', 'audit_logs', 'admin_profiles') loop
    execute format('grant select on public.%I to authenticated', t.tablename);
    execute format('create policy staff_read on public.%I for select to authenticated using (private.is_staff())', t.tablename);
  end loop;
end $$;

-- admin_profiles: each user may read their own row; owners read all.
grant select on public.admin_profiles to authenticated;
create policy self_read on public.admin_profiles for select to authenticated
  using (user_id = auth.uid() or private.current_admin_role() = 'owner');

-- audit logs: owner/admin read.
grant select on public.audit_logs to authenticated;
create policy admin_read on public.audit_logs for select to authenticated
  using (private.current_admin_role() in ('owner', 'admin'));

-- app_settings, rate_limit_buckets, anonymous_devices: no API access at all (RLS on, no policies).
