-- Field Mode + admin RPCs (spec §72–§105). Every function checks admin authorization.

-- ───────────── geometry helpers (local planar approximation; fine at street scale) ─────────────
create or replace function private.dist_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select sqrt(power((lng2 - lng1) * 111320 * cos(radians((lat1 + lat2) / 2)), 2) + power((lat2 - lat1) * 110574, 2))
$$;

-- Project a spot onto the nearest active Stall Display Line within 30 m. Raw coordinates are never touched.
create or replace function private.project_spot(p_spot uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.spots; l record;
  n int; i int; acc double precision;
  alat double precision; alng double precision; blat double precision; blng double precision;
  ax double precision; ay double precision; bx double precision; by_ double precision;
  dx double precision; dy double precision; len double precision; t double precision; d double precision;
  k double precision;
  best double precision := 30; best_line uuid; best_prog double precision; best_lat double precision; best_lng double precision;
begin
  select * into s from public.spots where id = p_spot;
  k := 111320 * cos(radians(s.raw_lat));
  for l in select id, path from public.stall_display_lines
           where area_id = s.area_id and is_active and deleted_at is null loop
    n := jsonb_array_length(l.path); acc := 0;
    for i in 0 .. n - 2 loop
      alat := (l.path -> i ->> 0)::float8; alng := (l.path -> i ->> 1)::float8;
      blat := (l.path -> (i + 1) ->> 0)::float8; blng := (l.path -> (i + 1) ->> 1)::float8;
      ax := (alng - s.raw_lng) * k; ay := (alat - s.raw_lat) * 110574;
      bx := (blng - s.raw_lng) * k; by_ := (blat - s.raw_lat) * 110574;
      dx := bx - ax; dy := by_ - ay; len := sqrt(dx * dx + dy * dy);
      if len > 0 then
        t := greatest(0, least(1, -(ax * dx + ay * dy) / (len * len)));
        d := sqrt(power(ax + t * dx, 2) + power(ay + t * dy, 2));
        if d < best then
          best := d; best_line := l.id; best_prog := acc + t * len;
          best_lat := alat + t * (blat - alat); best_lng := alng + t * (blng - alng);
        end if;
      end if;
      acc := acc + len;
    end loop;
  end loop;
  update public.spots set display_line_id = best_line, display_progress = best_prog,
         display_lat = best_lat, display_lng = best_lng
  where id = p_spot;
end $$;

create or replace function private.reproject_area(p_area uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select id from public.spots where area_id = p_area and status not in ('retired', 'merged_duplicate') loop
    perform private.project_spot(r.id);
  end loop;
end $$;

create or replace function private.default_area() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.areas where code = 'myeongdong'
$$;

create or replace function private.active_route(p_area uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare r uuid;
begin
  select id into r from public.patrol_routes where area_id = p_area and is_active;
  if r is null then
    insert into public.patrol_routes (area_id, name) values (p_area, 'Main patrol') returning id into r;
  end if;
  return r;
end $$;

create or replace function private.make_slug(p_base text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare b text; s text;
begin
  b := trim(both '-' from regexp_replace(lower(coalesce(p_base, '')), '[^a-z0-9]+', '-', 'g'));
  if b = '' then b := 'stall'; end if;
  loop
    s := left(b, 48) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    exit when not exists (select 1 from public.stalls where slug = s);
  end loop;
  return s;
end $$;

-- Find a normalized concept for a typed menu name (exact synonym match only — never guess).
create or replace function private.match_normalized(p_name text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.normalized_items
  where lower(regexp_replace(trim(p_name), '\s+', '', 'g')) = any (
          select lower(regexp_replace(x, '\s+', '', 'g')) from unnest(search_terms) x)
  order by code limit 1
$$;

create or replace function private.validate_category(p_code text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_code is null or not exists (select 1 from public.categories where code = p_code) then
    raise exception 'invalid category' using errcode = '22023';
  end if;
  return p_code;
end $$;

-- Apply weekly hours. p_hours: null → keep; {"mode":"DEFAULT"} → inherit area defaults;
-- {"mode":"CUSTOM","days":[{weekday,is_open,open_min,close_min}×7]}.
create or replace function private.apply_hours(p_stall uuid, p_hours jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare d jsonb;
begin
  if p_hours is null or p_hours = 'null'::jsonb then return; end if;
  delete from public.weekly_hours_overrides where stall_id = p_stall;
  if coalesce(p_hours ->> 'mode', 'DEFAULT') = 'DEFAULT' then
    update public.stalls set hours_mode = 'DEFAULT', hours_source = 'AREA_DEFAULT' where id = p_stall;
    return;
  end if;
  if jsonb_array_length(coalesce(p_hours -> 'days', '[]')) <> 7 then
    raise exception 'custom hours need 7 days' using errcode = '22023';
  end if;
  for d in select * from jsonb_array_elements(p_hours -> 'days') loop
    insert into public.weekly_hours_overrides (stall_id, weekday, is_open, open_min, close_min)
    values (p_stall, (d ->> 'weekday')::smallint, coalesce((d ->> 'is_open')::boolean, true),
            (d ->> 'open_min')::smallint, (d ->> 'close_min')::smallint);
  end loop;
  update public.stalls set hours_mode = 'CUSTOM',
         hours_source = coalesce((p_hours ->> 'source')::public.hours_source, 'FIELD_VERIFIED')
  where id = p_stall;
end $$;

-- Apply a menu list to a stall. Rows with an empty name are ignored (§89).
-- Item: {id?, name, price_type?, price?, price_min?, price_max?, spice? (0-3|null), spice_source?, is_representative?}
-- p_replace = true → active items not present in the list are soft-deleted.
-- The first item becomes representative unless one is flagged (§93).
create or replace function private.apply_menu(p_stall uuid, p_items jsonb, p_obs uuid, p_replace boolean) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  it jsonb; ord int := 0; mid uuid; nm text; pt public.price_type;
  amt int; pmin int; pmax int; sp smallint; kept uuid[] := '{}'; rep uuid; flagged uuid;
  old public.stall_menu_items;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return 0; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    nm := trim(coalesce(it ->> 'name', ''));
    continue when nm = '';
    if length(nm) > 80 then raise exception 'menu name too long' using errcode = '22023'; end if;
    ord := ord + 1;
    amt := nullif(it ->> 'price', '')::int;
    pmin := nullif(it ->> 'price_min', '')::int;
    pmax := nullif(it ->> 'price_max', '')::int;
    pt := coalesce(nullif(it ->> 'price_type', '')::public.price_type,
                   case when amt is not null then 'FIXED'::public.price_type else 'UNKNOWN'::public.price_type end);
    if pt = 'FIXED' and amt is null then pt := 'UNKNOWN'; end if;
    if pt <> 'FIXED' then amt := null; end if;
    if pt <> 'RANGE' then pmin := null; pmax := null; end if;
    sp := nullif(it ->> 'spice', '')::smallint;
    mid := nullif(it ->> 'id', '')::uuid;
    if mid is not null then
      select * into old from public.stall_menu_items where id = mid and stall_id = p_stall and deleted_at is null;
      if not found then raise exception 'menu item not found' using errcode = '22023'; end if;
      update public.stall_menu_items set
        display_name = nm,
        normalized_item_id = coalesce(case when old.display_name = nm then old.normalized_item_id end, private.match_normalized(nm)),
        price_type = pt, price_amount = amt, price_min = pmin, price_max = pmax,
        operator_spice_level = sp,
        spice_source = case when sp is null then 'UNKNOWN'
                            else coalesce(nullif(it ->> 'spice_source', '')::public.spice_source,
                                          case when old.operator_spice_level is not distinct from sp and old.spice_source <> 'UNKNOWN'
                                               then old.spice_source else 'FIELD_OBSERVED' end) end,
        display_order = ord, is_active = true
      where id = mid;
      if (old.price_type, old.price_amount, old.price_min, old.price_max) is distinct from (pt, amt, pmin, pmax) then
        insert into public.price_observations (menu_item_id, observation_id, price_type, price_amount, price_min, price_max)
        values (mid, p_obs, pt, amt, pmin, pmax);
      end if;
    else
      insert into public.stall_menu_items (stall_id, normalized_item_id, display_name, price_type, price_amount,
                                           price_min, price_max, operator_spice_level, spice_source, display_order)
      values (p_stall, private.match_normalized(nm), nm, pt, amt, pmin, pmax, sp,
              case when sp is null then 'UNKNOWN' else coalesce(nullif(it ->> 'spice_source', '')::public.spice_source, 'FIELD_OBSERVED') end,
              ord)
      returning id into mid;
      if pt <> 'UNKNOWN' then
        insert into public.price_observations (menu_item_id, observation_id, price_type, price_amount, price_min, price_max)
        values (mid, p_obs, pt, amt, pmin, pmax);
      end if;
    end if;
    kept := kept || mid;
    if coalesce((it ->> 'is_representative')::boolean, false) and flagged is null then flagged := mid; end if;
  end loop;

  if p_replace then
    update public.stall_menu_items set is_active = false, is_representative = false, deleted_at = now()
    where stall_id = p_stall and deleted_at is null and not (id = any (kept));
  end if;

  -- representative: flagged > existing (still active) > first
  select id into rep from public.stall_menu_items
  where stall_id = p_stall and deleted_at is null and is_representative;
  if flagged is not null or rep is null then
    update public.stall_menu_items set is_representative = false where stall_id = p_stall and is_representative;
    update public.stall_menu_items set is_representative = true
    where id = coalesce(flagged, (select id from public.stall_menu_items where stall_id = p_stall and deleted_at is null
                                  order by display_order, created_at limit 1));
  end if;
  return ord;
end $$;

create or replace function private.apply_hint(p_spot uuid, p_hint jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_hint is null or p_hint = 'null'::jsonb then return; end if;
  update public.spots set
    hint_landmark_id = nullif(p_hint ->> 'landmark_id', '')::uuid,
    hint_relation = coalesce(nullif(p_hint ->> 'relation', '')::public.hint_relation, 'near'),
    hint_verified = coalesce((p_hint ->> 'verified')::boolean, false),
    hint_text_i18n = coalesce(p_hint -> 'text_i18n', '{}')
  where id = p_spot;
end $$;

create or replace function private.route_insert(p_route uuid, p_spot uuid, p_after uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare pos int;
begin
  if exists (select 1 from public.patrol_route_spots where route_id = p_route and spot_id = p_spot) then
    select order_position into pos from public.patrol_route_spots where route_id = p_route and spot_id = p_spot;
    return pos;
  end if;
  if p_after is not null then
    select order_position into pos from public.patrol_route_spots where route_id = p_route and spot_id = p_after;
  end if;
  if pos is null then
    select coalesce(max(order_position), 0) into pos from public.patrol_route_spots where route_id = p_route;
  else
    update public.patrol_route_spots set order_position = order_position + 1
    where route_id = p_route and order_position > pos;
  end if;
  insert into public.patrol_route_spots (route_id, spot_id, order_position) values (p_route, p_spot, pos + 1);
  perform private.normalize_route(p_route);
  return (select o from (select spot_id, row_number() over (order by order_position) o
                         from public.patrol_route_spots where route_id = p_route) x where spot_id = p_spot);
end $$;

-- Rewrite positions to 1..n and bump version. O numbers are always derived from this order.
create or replace function private.normalize_route(p_route uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  set constraints public.route_order_unique deferred;
  update public.patrol_route_spots r set order_position = x.o
  from (select spot_id, row_number() over (order by order_position) o from public.patrol_route_spots where route_id = p_route) x
  where r.route_id = p_route and r.spot_id = x.spot_id and r.order_position <> x.o;
  update public.patrol_routes set version = version + 1 where id = p_route;
end $$;

create or replace function private.new_stall(p_category text, p_items jsonb, p_actor uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid; base text;
begin
  select ni.code into base
  from jsonb_array_elements(coalesce(p_items, '[]')) e
  join public.normalized_items ni on ni.id = private.match_normalized(e ->> 'name')
  where trim(coalesce(e ->> 'name', '')) <> '' limit 1;
  insert into public.stalls (slug, category_code, created_by)
  values (private.make_slug(base), private.validate_category(p_category), p_actor)
  returning id into sid;
  return sid;
end $$;

-- ───────────── field read RPCs ─────────────
create or replace function public.field_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a uuid := private.default_area(); r uuid;
begin
  perform private.require_role('field_worker');
  select id into r from public.patrol_routes where area_id = a and is_active;
  return jsonb_build_object(
    'spot_count', (select count(*) from public.spots where status not in ('retired', 'merged_duplicate')),
    'next_m', (select last_value + 1 from public.spot_number_allocator),
    'route_id', r,
    'route_length', (select count(*) from public.patrol_route_spots where route_id = r),
    'role', private.current_admin_role()
  );
end $$;

-- Everything Field Mode needs to draw its map.
create or replace function public.field_map() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a uuid := private.default_area(); r uuid;
begin
  perform private.require_role('field_worker');
  select id into r from public.patrol_routes where area_id = a and is_active;
  return jsonb_build_object(
    'area', (select to_jsonb(x) from (select id, code, center_lat, center_lng, default_zoom from public.areas where id = a) x),
    'default_hours', (select coalesce(jsonb_agg(to_jsonb(h) order by weekday), '[]') from public.area_default_hours h where area_id = a),
    'landmarks', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name_i18n', name_i18n,
                   'short_i18n', short_i18n, 'lat', lat, 'lng', lng, 'kind', kind, 'priority', priority)), '[]')
                  from public.landmarks where area_id = a and deleted_at is null),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'path', path, 'is_active', is_active)), '[]')
              from public.stall_display_lines where area_id = a and deleted_at is null),
    'spots', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'm_number', s.m_number, 'status', s.status,
                'raw_lat', s.raw_lat, 'raw_lng', s.raw_lng,
                'display_line_id', s.display_line_id, 'display_progress', s.display_progress,
                'display_lat', s.display_lat, 'display_lng', s.display_lng,
                'o_number', ro.o,
                'category_code', st.category_code, 'stall_id', st.id,
                'rep_name', (select display_name from public.stall_menu_items mi where mi.stall_id = st.id and mi.is_representative and mi.deleted_at is null)
              ) order by s.m_number), '[]')
              from public.spots s
              left join public.stall_spot_assignments asg on asg.spot_id = s.id and asg.ended_at is null
              left join public.stalls st on st.id = asg.stall_id
              left join (select spot_id, row_number() over (order by order_position) o
                         from public.patrol_route_spots where route_id = r) ro on ro.spot_id = s.id
              where s.area_id = a and s.status not in ('retired', 'merged_duplicate'))
  );
end $$;

create or replace function public.field_nearby_spots(p_lat double precision, p_lng double precision, p_radius double precision default 12)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('field_worker');
  return (select coalesce(jsonb_agg(x order by x.distance_m), '[]') from (
    select s.id as spot_id, s.m_number, round(private.dist_m(p_lat, p_lng, s.raw_lat, s.raw_lng)::numeric, 1) as distance_m,
           st.category_code,
           (select display_name from public.stall_menu_items mi where mi.stall_id = st.id and mi.is_representative and mi.deleted_at is null) as rep_name
    from public.spots s
    left join public.stall_spot_assignments asg on asg.spot_id = s.id and asg.ended_at is null
    left join public.stalls st on st.id = asg.stall_id
    where s.status not in ('retired', 'merged_duplicate')
      and abs(s.raw_lat - p_lat) < 0.0005 and abs(s.raw_lng - p_lng) < 0.0006
      and private.dist_m(p_lat, p_lng, s.raw_lat, s.raw_lng) <= least(p_radius, 50)
  ) x);
end $$;

-- Ordered patrol list with derived O numbers.
create or replace function public.field_route(p_route uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r uuid := p_route;
begin
  perform private.require_role('field_worker');
  if r is null then select id into r from public.patrol_routes where area_id = private.default_area() and is_active; end if;
  return jsonb_build_object('route_id', r,
    'version', (select version from public.patrol_routes where id = r),
    'items', (select coalesce(jsonb_agg(x order by x.o_number), '[]') from (
      select row_number() over (order by rs.order_position) as o_number,
             s.id as spot_id, s.m_number, s.status, coalesce(s.display_lat, s.raw_lat) as lat, coalesce(s.display_lng, s.raw_lng) as lng,
             s.hint_landmark_id, st.id as stall_id, st.category_code,
             (select display_name from public.stall_menu_items mi where mi.stall_id = st.id and mi.is_representative and mi.deleted_at is null) as rep_name,
             (select jsonb_build_object('result', o.result, 'observed_at', o.observed_at)
                from public.observations o where o.spot_id = s.id order by o.observed_at desc limit 1) as last_observation
      from public.patrol_route_spots rs
      join public.spots s on s.id = rs.spot_id
      left join public.stall_spot_assignments asg on asg.spot_id = s.id and asg.ended_at is null
      left join public.stalls st on st.id = asg.stall_id
      where rs.route_id = r) x));
end $$;

-- ───────────── field write RPCs ─────────────
-- One "Save" = spot + M number + stall + assignment + INITIAL observation + menu + prices + spice
--              + hours (default inherited) + route insertion + O order (§96). All-or-nothing.
create or replace function public.field_create_spot(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  a uuid := private.default_area(); actor uuid := auth.uid();
  req uuid := nullif(p ->> 'client_request_id', '')::uuid;
  lat double precision := (p ->> 'lat')::float8; lng double precision := (p ->> 'lng')::float8;
  m int; sp uuid; st uuid; obs uuid; route uuid; o int; n_items int; prev public.observations;
  ar public.areas;
begin
  perform private.require_role('field_worker');
  if req is not null then
    select * into prev from public.observations where client_request_id = req;
    if found then  -- idempotent replay (double tap / retried request)
      return (select jsonb_build_object('spot_id', s.id, 'stall_id', prev.stall_id, 'm_number', s.m_number, 'replayed', true)
              from public.spots s where s.id = prev.spot_id);
    end if;
  end if;
  select * into ar from public.areas where id = a;
  if lat is null or lng is null or private.dist_m(lat, lng, ar.center_lat, ar.center_lng) > 3000 then
    raise exception 'coordinate outside area' using errcode = '22023';
  end if;
  perform private.validate_category(p ->> 'category_code');

  update public.spot_number_allocator set last_value = last_value + 1 where id returning last_value into m;

  insert into public.spots (area_id, m_number, raw_lat, raw_lng, created_by)
  values (a, m, lat, lng, actor) returning id into sp;
  insert into public.spot_location_history (spot_id, lat, lng, reason, changed_by) values (sp, lat, lng, 'created', actor);
  perform private.apply_hint(sp, p -> 'hint');
  perform private.project_spot(sp);

  st := private.new_stall(p ->> 'category_code', p -> 'items', actor);
  insert into public.stall_spot_assignments (stall_id, spot_id, created_by) values (st, sp, actor);
  insert into public.observations (client_request_id, spot_id, stall_id, result, observer_id, details)
  values (req, sp, st, 'INITIAL', actor, jsonb_build_object('category_code', p ->> 'category_code'))
  returning id into obs;
  n_items := private.apply_menu(st, p -> 'items', obs, false);
  perform private.apply_hours(st, p -> 'hours');

  route := private.active_route(a);
  o := private.route_insert(route, sp, nullif(p ->> 'insert_after_spot_id', '')::uuid);
  update public.observations set route_id = route where id = obs;

  return jsonb_build_object('spot_id', sp, 'stall_id', st, 'm_number', m, 'o_number', o,
                            'menu_count', n_items, 'route_id', route);
end $$;

-- Patrol quick actions: SAME / NO_STALL / UNCERTAIN (§101). Never deletes or retires the spot.
create or replace function public.field_record_observation(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  req uuid := nullif(p ->> 'client_request_id', '')::uuid;
  sp uuid := (p ->> 'spot_id')::uuid;
  res public.observation_result := (p ->> 'result')::public.observation_result;
  cur uuid; obs uuid;
begin
  perform private.require_role('field_worker');
  if res not in ('SAME', 'NO_STALL', 'UNCERTAIN') then
    raise exception 'use field_apply_change for changes' using errcode = '22023';
  end if;
  if req is not null and exists (select 1 from public.observations where client_request_id = req) then
    return jsonb_build_object('observation_id', (select id from public.observations where client_request_id = req), 'replayed', true);
  end if;
  if not exists (select 1 from public.spots where id = sp and status not in ('retired', 'merged_duplicate')) then
    raise exception 'spot not found' using errcode = '22023';
  end if;
  select stall_id into cur from public.stall_spot_assignments where spot_id = sp and ended_at is null;
  insert into public.observations (client_request_id, spot_id, stall_id, route_id, result, observer_id, details)
  values (req, sp, case when res = 'SAME' then cur end, nullif(p ->> 'route_id', '')::uuid, res, auth.uid(),
          jsonb_strip_nulls(jsonb_build_object('expected_stall_id', cur, 'note', nullif(p ->> 'note', ''))))
  returning id into obs;
  return jsonb_build_object('observation_id', obs);
end $$;

-- Patrol "Changed" (§102): any combination of menu/price/spice/hours/category/hint/position changes,
-- or a different stall now occupying the spot. History is preserved.
create or replace function public.field_apply_change(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  req uuid := nullif(p ->> 'client_request_id', '')::uuid;
  sp uuid := (p ->> 'spot_id')::uuid; s public.spots;
  cur uuid; st uuid; obs uuid; new_occ boolean := coalesce((p ->> 'new_occupant')::boolean, false);
begin
  perform private.require_role('field_worker');
  if req is not null and exists (select 1 from public.observations where client_request_id = req) then
    return jsonb_build_object('observation_id', (select id from public.observations where client_request_id = req), 'replayed', true);
  end if;
  select * into s from public.spots where id = sp and status not in ('retired', 'merged_duplicate');
  if not found then raise exception 'spot not found' using errcode = '22023'; end if;
  select stall_id into cur from public.stall_spot_assignments where spot_id = sp and ended_at is null;

  if new_occ or cur is null then
    update public.stall_spot_assignments set ended_at = now(), ended_reason = 'replaced' where spot_id = sp and ended_at is null;
    st := private.new_stall(coalesce(p ->> 'category_code', (select category_code from public.stalls where id = cur)), p -> 'items', actor);
    insert into public.stall_spot_assignments (stall_id, spot_id, created_by) values (st, sp, actor);
  else
    st := cur;
    if p ? 'category_code' then
      update public.stalls set category_code = private.validate_category(p ->> 'category_code') where id = st;
    end if;
  end if;

  insert into public.observations (client_request_id, spot_id, stall_id, route_id, result, observer_id, details)
  values (req, sp, st, nullif(p ->> 'route_id', '')::uuid, 'CHANGED', actor,
          jsonb_strip_nulls(jsonb_build_object('previous_stall_id', case when st <> cur then cur end,
                                               'new_occupant', new_occ, 'note', nullif(p ->> 'note', ''),
                                               'changed', (select jsonb_agg(k) from jsonb_object_keys(p) k
                                                           where k not in ('client_request_id', 'spot_id', 'route_id', 'note')))))
  returning id into obs;

  if p ? 'items' then perform private.apply_menu(st, p -> 'items', obs, true); end if;
  if p ? 'hours' then perform private.apply_hours(st, p -> 'hours'); end if;
  if p ? 'hint' then perform private.apply_hint(sp, p -> 'hint'); end if;
  if p ? 'lat' and p ? 'lng' then
    if private.dist_m(s.raw_lat, s.raw_lng, (p ->> 'lat')::float8, (p ->> 'lng')::float8) > 15 then
      raise exception 'large move: register a new spot instead' using errcode = '22023';
    end if;
    update public.spots set raw_lat = (p ->> 'lat')::float8, raw_lng = (p ->> 'lng')::float8 where id = sp;
    insert into public.spot_location_history (spot_id, lat, lng, reason, changed_by)
    values (sp, (p ->> 'lat')::float8, (p ->> 'lng')::float8, 'moved', actor);
    perform private.project_spot(sp);
  end if;
  return jsonb_build_object('observation_id', obs, 'stall_id', st);
end $$;

-- ───────────── admin: stall editor ─────────────
create or replace function public.admin_get_stall(p_stall uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('field_worker');
  return (select jsonb_build_object(
    'stall', to_jsonb(st),
    'localizations', (select coalesce(jsonb_object_agg(locale, jsonb_build_object('display_name', display_name, 'description', description)), '{}')
                      from public.stall_localizations where stall_id = st.id),
    'items', (select coalesce(jsonb_agg(to_jsonb(mi) order by display_order), '[]')
              from public.stall_menu_items mi where mi.stall_id = st.id and mi.deleted_at is null),
    'hours', (select coalesce(jsonb_agg(to_jsonb(h) order by weekday), '[]') from public.weekly_hours_overrides h where h.stall_id = st.id),
    'spot', (select to_jsonb(s) from public.spots s join public.stall_spot_assignments a on a.spot_id = s.id and a.ended_at is null where a.stall_id = st.id limit 1),
    'observations', (select coalesce(jsonb_agg(x order by x.observed_at desc), '[]') from (
                      select o.id, o.result, o.observed_at, o.details from public.observations o
                      where o.stall_id = st.id or o.spot_id in (select spot_id from public.stall_spot_assignments where stall_id = st.id)
                      order by o.observed_at desc limit 30) x)
  ) from public.stalls st where st.id = p_stall and st.deleted_at is null);
end $$;

create or replace function public.admin_update_stall(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare st uuid := (p ->> 'stall_id')::uuid; loc text; sp uuid;
begin
  perform private.require_role('field_worker');
  if not exists (select 1 from public.stalls where id = st and deleted_at is null) then
    raise exception 'stall not found' using errcode = '22023';
  end if;
  if p ? 'category_code' then update public.stalls set category_code = private.validate_category(p ->> 'category_code') where id = st; end if;
  if p ? 'official_name' then update public.stalls set official_name = nullif(trim(p ->> 'official_name'), '') where id = st; end if;
  if p ? 'display_names' then
    for loc in select jsonb_object_keys(p -> 'display_names') loop
      insert into public.stall_localizations (stall_id, locale, display_name) values (st, loc, nullif(trim(p -> 'display_names' ->> loc), ''))
      on conflict (stall_id, locale) do update set display_name = excluded.display_name;
    end loop;
  end if;
  if p ? 'items' then perform private.apply_menu(st, p -> 'items', null, true); end if;
  if p ? 'hours' then perform private.apply_hours(st, p -> 'hours'); end if;
  if p ? 'hint' then
    select spot_id into sp from public.stall_spot_assignments where stall_id = st and ended_at is null;
    if sp is not null then perform private.apply_hint(sp, p -> 'hint'); end if;
  end if;
  if p ? 'representative_item_id' then
    if not exists (select 1 from public.stall_menu_items where id = (p ->> 'representative_item_id')::uuid and stall_id = st and deleted_at is null) then
      raise exception 'menu item not found' using errcode = '22023';
    end if;
    update public.stall_menu_items set is_representative = false where stall_id = st and is_representative;
    update public.stall_menu_items set is_representative = true where id = (p ->> 'representative_item_id')::uuid;
  end if;
  update public.stalls set updated_at = now() where id = st;
  return public.admin_get_stall(st);
end $$;

-- ───────────── admin: routes ─────────────
create or replace function public.admin_route_move(p_route uuid, p_spot uuid, p_to_position integer) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ids uuid[]; i int;
begin
  perform private.require_role('field_worker');
  select array_agg(spot_id order by order_position) into ids from public.patrol_route_spots where route_id = p_route;
  if ids is null or not (p_spot = any (ids)) then raise exception 'spot not in route' using errcode = '22023'; end if;
  ids := array_remove(ids, p_spot);
  i := greatest(1, least(p_to_position, coalesce(array_length(ids, 1), 0) + 1));
  ids := ids[1:i - 1] || p_spot || ids[i:];
  set constraints public.route_order_unique deferred;
  update public.patrol_route_spots r set order_position = x.o
  from unnest(ids) with ordinality x(spot_id, o) where r.route_id = p_route and r.spot_id = x.spot_id;
  update public.patrol_routes set version = version + 1 where id = p_route;
  return public.field_route(p_route);
end $$;

create or replace function public.admin_route_insert(p_route uuid, p_spot uuid, p_after uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('field_worker');
  perform private.route_insert(p_route, p_spot, p_after);
  return public.field_route(p_route);
end $$;

create or replace function public.admin_route_remove(p_route uuid, p_spot uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('admin');
  delete from public.patrol_route_spots where route_id = p_route and spot_id = p_spot;
  perform private.normalize_route(p_route);
  return public.field_route(p_route);
end $$;

-- ───────────── admin: spots ─────────────
create or replace function public.admin_set_spot_status(p_spot uuid, p_status public.spot_status) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('admin');
  if p_status = 'merged_duplicate' then raise exception 'use admin_merge_spots' using errcode = '22023'; end if;
  update public.spots set status = p_status where id = p_spot and status <> 'merged_duplicate';
  if p_status = 'retired' then
    update public.stall_spot_assignments set ended_at = now(), ended_reason = 'spot_retired' where spot_id = p_spot and ended_at is null;
  end if;
end $$;

-- §81: merge a duplicate spot into the canonical one. The duplicate's M is preserved, never reused.
create or replace function public.admin_merge_spots(p_duplicate uuid, p_target uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r record;
begin
  perform private.require_role('admin');
  if p_duplicate = p_target then raise exception 'same spot' using errcode = '22023'; end if;
  if not exists (select 1 from public.spots where id = p_target and status not in ('retired', 'merged_duplicate')) then
    raise exception 'invalid target' using errcode = '22023';
  end if;
  update public.observations set details = details || jsonb_build_object('merged_from_spot_id', p_duplicate), spot_id = p_target
  where spot_id = p_duplicate;
  update public.reports set spot_id = p_target where spot_id = p_duplicate;
  update public.photos set spot_id = p_target where spot_id = p_duplicate;
  -- occupancy: if the target has no current occupant, the duplicate's occupant moves over; otherwise it ends.
  if exists (select 1 from public.stall_spot_assignments where spot_id = p_target and ended_at is null) then
    update public.stall_spot_assignments set ended_at = now(), ended_reason = 'merged_duplicate' where spot_id = p_duplicate and ended_at is null;
  else
    update public.stall_spot_assignments set spot_id = p_target where spot_id = p_duplicate and ended_at is null;
  end if;
  update public.stall_spot_assignments set spot_id = p_target where spot_id = p_duplicate and ended_at is not null;
  for r in select route_id from public.patrol_route_spots where spot_id = p_duplicate loop
    delete from public.patrol_route_spots where route_id = r.route_id and spot_id = p_duplicate;
    perform private.normalize_route(r.route_id);
  end loop;
  update public.spots set status = 'merged_duplicate', merged_into_spot_id = p_target where id = p_duplicate;
end $$;

-- ───────────── admin: display lines ─────────────
create or replace function public.admin_save_display_line(p_id uuid, p_name text, p_path jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare lid uuid := p_id; a uuid := private.default_area(); pt jsonb;
begin
  perform private.require_role('field_worker');
  if jsonb_typeof(p_path) <> 'array' or jsonb_array_length(p_path) < 2 or jsonb_array_length(p_path) > 200 then
    raise exception 'line needs 2..200 points' using errcode = '22023';
  end if;
  for pt in select * from jsonb_array_elements(p_path) loop
    if jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) <> 2 then raise exception 'bad point' using errcode = '22023'; end if;
  end loop;
  if lid is null then
    insert into public.stall_display_lines (area_id, name, path, created_by) values (a, coalesce(p_name, ''), p_path, auth.uid()) returning id into lid;
  else
    update public.stall_display_lines set name = coalesce(p_name, name), path = p_path where id = lid and deleted_at is null;
    if not found then raise exception 'line not found' using errcode = '22023'; end if;
  end if;
  perform private.reproject_area(a);
  return lid;
end $$;

create or replace function public.admin_delete_display_line(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('field_worker');
  update public.stall_display_lines set deleted_at = now(), is_active = false where id = p_id;
  perform private.reproject_area(private.default_area());
end $$;

create or replace function public.admin_whoami() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('user_id', auth.uid(), 'role', private.current_admin_role(),
                            'aal', auth.jwt() ->> 'aal',
                            'require_mfa', (select require_mfa from public.app_settings where id),
                            'profile_role', (select role from public.admin_profiles where user_id = auth.uid() and is_active))
$$;

grant execute on function
  public.field_status(), public.field_map(), public.field_nearby_spots(double precision, double precision, double precision),
  public.field_route(uuid), public.field_create_spot(jsonb), public.field_record_observation(jsonb),
  public.field_apply_change(jsonb), public.admin_get_stall(uuid), public.admin_update_stall(jsonb),
  public.admin_route_move(uuid, uuid, integer), public.admin_route_insert(uuid, uuid, uuid), public.admin_route_remove(uuid, uuid),
  public.admin_set_spot_status(uuid, public.spot_status), public.admin_merge_spots(uuid, uuid),
  public.admin_save_display_line(uuid, text, jsonb), public.admin_delete_display_line(uuid), public.admin_whoami()
to authenticated;
