-- Streets with stalls on both sides (operator decision 2026-11-12).
-- An operator draws a street's centre once + its width; the two sidewalk-edge Stall Display Lines
-- (left/right) are generated from it. Spots project onto the nearer edge, so every street shows two rows.
-- Raw coordinates are still never modified. Single-side lines remain possible.

alter table public.stall_display_lines
  add column street_group uuid,
  add column side text check (side in ('left', 'right')),
  add column center_path jsonb,
  add column width_m real check (width_m is null or width_m between 3 and 60);
create unique index one_side_per_street on public.stall_display_lines (street_group, side)
  where street_group is not null and deleted_at is null;

-- Offset a [[lat,lng],…] polyline sideways by p_meters (positive = left of travel direction).
-- Vertex normals use the direction between neighbouring vertices (smooth for gentle bends).
create or replace function private.offset_path(p_path jsonb, p_meters double precision) returns jsonb
language plpgsql immutable as $$
declare
  n int := jsonb_array_length(p_path); i int; out jsonb := '[]';
  lat0 double precision := (p_path -> 0 ->> 0)::float8; k double precision := 111320 * cos(radians(lat0));
  la double precision; ln double precision; pa double precision; pn double precision; na double precision; nn double precision;
  dx double precision; dy double precision; len double precision;
begin
  for i in 0 .. n - 1 loop
    la := (p_path -> i ->> 0)::float8; ln := (p_path -> i ->> 1)::float8;
    pa := (p_path -> greatest(i - 1, 0) ->> 0)::float8; pn := (p_path -> greatest(i - 1, 0) ->> 1)::float8;
    na := (p_path -> least(i + 1, n - 1) ->> 0)::float8; nn := (p_path -> least(i + 1, n - 1) ->> 1)::float8;
    dx := (nn - pn) * k; dy := (na - pa) * 110574; len := sqrt(dx * dx + dy * dy);
    if len = 0 then out := out || jsonb_build_array(jsonb_build_array(la, ln)); continue; end if;
    -- left normal of (dx, dy) is (-dy, dx)
    out := out || jsonb_build_array(jsonb_build_array(
      la + (dx / len) * p_meters / 110574,
      ln + (-dy / len) * p_meters / k));
  end loop;
  return out;
end $$;

-- Create or update a two-sided street. Returns the street_group id.
create or replace function public.admin_save_street(p_group uuid, p_name text, p_center jsonb, p_width real) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare g uuid := coalesce(p_group, gen_random_uuid()); a uuid := private.default_area(); s text; pt jsonb;
begin
  perform private.require_role('field_worker');
  if jsonb_typeof(p_center) <> 'array' or jsonb_array_length(p_center) < 2 or jsonb_array_length(p_center) > 200 then
    raise exception 'line needs 2..200 points' using errcode = '22023';
  end if;
  for pt in select * from jsonb_array_elements(p_center) loop
    if jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) <> 2 then raise exception 'bad point' using errcode = '22023'; end if;
  end loop;
  if p_width is null or p_width < 3 or p_width > 60 then raise exception 'street width must be 3..60 m' using errcode = '22023'; end if;
  if p_group is not null and not exists (select 1 from public.stall_display_lines where street_group = p_group and deleted_at is null) then
    raise exception 'street not found' using errcode = '22023';
  end if;
  foreach s in array array['left', 'right'] loop
    update public.stall_display_lines
       set name = coalesce(p_name, name), center_path = p_center, width_m = p_width,
           path = private.offset_path(p_center, case when s = 'left' then p_width / 2 else -p_width / 2 end)
     where street_group = g and side = s and deleted_at is null;
    if not found then
      insert into public.stall_display_lines (area_id, name, path, street_group, side, center_path, width_m, created_by)
      values (a, coalesce(p_name, ''), private.offset_path(p_center, case when s = 'left' then p_width / 2 else -p_width / 2 end),
              g, s, p_center, p_width, auth.uid());
    end if;
  end loop;
  perform private.reproject_area(a);
  return g;
end $$;

create or replace function public.admin_delete_street(p_group uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('field_worker');
  update public.stall_display_lines set deleted_at = now(), is_active = false where street_group = p_group and deleted_at is null;
  perform private.reproject_area(private.default_area());
end $$;

-- field_map: include street fields
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
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'path', path, 'is_active', is_active,
                'street_group', street_group, 'side', side, 'center_path', center_path, 'width_m', width_m)), '[]')
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

-- public map: lines also carry the street centre + width (used only to draw roads on the fallback map)
create or replace function public.public_map_stalls(p_secret text, p_min_lat double precision, p_min_lng double precision,
                                                    p_max_lat double precision, p_max_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  if p_max_lat - p_min_lat > 0.03 or p_max_lng - p_min_lng > 0.035 or p_max_lat < p_min_lat or p_max_lng < p_min_lng then
    raise exception 'viewport too large' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path, 'center_path', center_path, 'width_m', width_m, 'street_group', street_group)), '[]')
              from public.stall_display_lines
              where is_active and deleted_at is null
                and exists (select 1 from jsonb_array_elements(path) p
                            where (p ->> 0)::float8 between p_min_lat - 0.003 and p_max_lat + 0.003
                              and (p ->> 1)::float8 between p_min_lng - 0.003 and p_max_lng + 0.003)),
    'stalls', (select coalesce(jsonb_agg(private.stall_card(st, s)), '[]')
               from public.spots s
               join public.stall_spot_assignments a on a.spot_id = s.id and a.ended_at is null
               join public.stalls st on st.id = a.stall_id and st.deleted_at is null and st.is_active
               where s.status = 'active'
                 and coalesce(s.display_lat, s.raw_lat) between p_min_lat and p_max_lat
                 and coalesce(s.display_lng, s.raw_lng) between p_min_lng and p_max_lng
               limit 1500)
  );
end $$;

revoke execute on function private.offset_path(jsonb, double precision) from public;
revoke execute on function public.admin_save_street(uuid, text, jsonb, real), public.admin_delete_street(uuid) from public, anon;
grant execute on function public.admin_save_street(uuid, text, jsonb, real), public.admin_delete_street(uuid) to authenticated;
-- create or replace keeps existing grants; re-assert the intended ones
revoke execute on function public.field_map() from public, anon;
grant execute on function public.field_map() to authenticated;
revoke execute on function public.public_map_stalls(text, double precision, double precision, double precision, double precision) from public;
grant execute on function public.public_map_stalls(text, double precision, double precision, double precision, double precision) to anon, authenticated;
