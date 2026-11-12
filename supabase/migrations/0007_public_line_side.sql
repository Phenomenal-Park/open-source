-- public map lines now include `side`, so markers on two-sided streets are pushed onto the sidewalk (never over the road).
create or replace function public.public_map_stalls(p_secret text, p_min_lat double precision, p_min_lng double precision,
                                                    p_max_lat double precision, p_max_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  if p_max_lat - p_min_lat > 0.03 or p_max_lng - p_min_lng > 0.035 or p_max_lat < p_min_lat or p_max_lng < p_min_lng then
    raise exception 'viewport too large' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path, 'side', side, 'center_path', center_path, 'width_m', width_m, 'street_group', street_group)), '[]')
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

revoke execute on function public.public_map_stalls(text, double precision, double precision, double precision, double precision) from public;
grant execute on function public.public_map_stalls(text, double precision, double precision, double precision, double precision) to anon, authenticated;
