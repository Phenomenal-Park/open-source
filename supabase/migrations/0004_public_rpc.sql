-- Public RPCs. Called ONLY by the Next.js server (anon key + server secret), which adds IP-based
-- rate limiting on top of the per-device limits here. Reads are viewport/slug scoped; there is
-- deliberately no "export everything" function (§130).

-- ───────────── shared projections ─────────────
create or replace function private.item_name_i18n(mi public.stall_menu_items) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select name_i18n from public.normalized_items where id = mi.normalized_item_id), '{}')
         || mi.name_i18n
$$;

create or replace function private.price_json(mi public.stall_menu_items) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('type', mi.price_type, 'amount', mi.price_amount, 'min', mi.price_min, 'max', mi.price_max))
$$;

create or replace function private.hint_json(s public.spots) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'relation', s.hint_relation, 'verified', s.hint_verified, 'text_i18n', s.hint_text_i18n,
    'landmark', (select jsonb_build_object('name_i18n', l.name_i18n, 'short_i18n', l.short_i18n)
                 from public.landmarks l where l.id = s.hint_landmark_id and l.deleted_at is null))
$$;

create or replace function private.spice_summary(p_item uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  -- median (lower) rounded to an integer level; no fake precision (§51)
  select jsonb_build_object('count', count(*),
                            'level', case when count(*) > 0 then percentile_disc(0.5) within group (order by level) end)
  from public.menu_spice_votes where menu_item_id = p_item
$$;

create or replace function private.stall_card(st public.stalls, s public.spots) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', st.id, 'slug', st.slug, 'category_code', st.category_code,
    'kind', (select kind from public.categories where code = st.category_code),
    'official_name', st.official_name,
    'names', (select coalesce(jsonb_object_agg(locale, display_name), '{}') from public.stall_localizations
              where stall_id = st.id and display_name is not null),
    'lat', coalesce(s.display_lat, s.raw_lat), 'lng', coalesce(s.display_lng, s.raw_lng),
    'line_id', s.display_line_id, 'progress', s.display_progress,
    'hint', private.hint_json(s),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                 'name', mi.display_name, 'name_i18n', private.item_name_i18n(mi), 'price', private.price_json(mi),
                 'rep', mi.is_representative,
                 'sub', (select code from public.subcategories where id = coalesce(mi.subcategory_id,
                          (select subcategory_id from public.normalized_items where id = mi.normalized_item_id)))
               ) order by mi.is_representative desc, mi.display_order), '[]')
              from public.stall_menu_items mi where mi.stall_id = st.id and mi.deleted_at is null and mi.is_active),
    'tags', (select coalesce(jsonb_agg(tag_code), '[]') from public.stall_tags where stall_id = st.id),
    'rating', (select jsonb_build_object('avg', round(avg(rating)::numeric, 1), 'count', count(*))
               from public.reviews r where r.stall_id = st.id and r.deleted_at is null and r.status = 'visible'),
    'hours_mode', st.hours_mode,
    'hours', case when st.hours_mode = 'CUSTOM' then
               (select jsonb_agg(jsonb_build_object('weekday', weekday, 'is_open', is_open, 'open_min', open_min, 'close_min', close_min) order by weekday)
                from public.weekly_hours_overrides where stall_id = st.id) end,
    'halal', exists (select 1 from public.dietary_claims d where d.stall_id = st.id and d.deleted_at is null
                     and d.claim in ('halal_certified', 'seller_claims_halal')),
    'card', (select case when count(*) filter (where kind = 'card_worked') > count(*) filter (where kind = 'card_failed') then true
                         when count(*) filter (where kind = 'card_failed') > 0 then false end
             from public.payment_observations p where p.stall_id = st.id and p.observed_at > now() - interval '120 days'),
    'photo', (select storage_path from public.photos ph
              where ph.id = st.representative_photo_id and ph.deleted_at is null and ph.status = 'visible')
  )
$$;

-- ───────────── public reads ─────────────
create or replace function public.public_reference(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a uuid := private.default_area();
begin
  perform private.require_server(p_secret);
  return jsonb_build_object(
    'area', (select jsonb_build_object('center_lat', center_lat, 'center_lng', center_lng, 'default_zoom', default_zoom, 'timezone', timezone)
             from public.areas where id = a),
    'default_hours', (select jsonb_agg(jsonb_build_object('weekday', weekday, 'is_open', is_open, 'open_min', open_min, 'close_min', close_min) order by weekday)
                      from public.area_default_hours where area_id = a),
    'categories', (select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'color', color, 'color_dark', color_dark, 'name_i18n', name_i18n) order by sort_order)
                   from public.categories),
    'subcategories', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'category_code', category_code, 'name_i18n', name_i18n) order by category_code, sort_order), '[]')
                      from public.subcategories where is_public_filter),
    'landmarks', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name_i18n', name_i18n, 'lat', lat, 'lng', lng, 'kind', kind, 'priority', priority)), '[]')
                  from public.landmarks where area_id = a and deleted_at is null)
  );
end $$;

-- Viewport query. Bounding boxes larger than ~3 km are refused.
create or replace function public.public_map_stalls(p_secret text, p_min_lat double precision, p_min_lng double precision,
                                                    p_max_lat double precision, p_max_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  if p_max_lat - p_min_lat > 0.03 or p_max_lng - p_min_lng > 0.035 or p_max_lat < p_min_lat or p_max_lng < p_min_lng then
    raise exception 'viewport too large' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path)), '[]') from public.stall_display_lines
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

create or replace function public.public_stall(p_secret text, p_slug text, p_device_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare st public.stalls; s public.spots; dev uuid;
begin
  perform private.require_server(p_secret);
  select * into st from public.stalls where slug = p_slug and deleted_at is null;
  if not found then return null; end if;
  select sp.* into s from public.spots sp join public.stall_spot_assignments a on a.spot_id = sp.id and a.ended_at is null
  where a.stall_id = st.id limit 1;
  if p_device_token is not null then
    select id into dev from public.anonymous_devices where token_hash = encode(sha256(convert_to(p_device_token, 'UTF8')), 'hex');
  end if;
  return private.stall_card(st, s) || jsonb_build_object(
    'is_active', st.is_active and s.id is not null and s.status = 'active',
    'raw_lat', s.raw_lat, 'raw_lng', s.raw_lng,
    'menu', (select coalesce(jsonb_agg(jsonb_build_object(
               'id', mi.id, 'name', mi.display_name, 'name_i18n', private.item_name_i18n(mi), 'price', private.price_json(mi),
               'rep', mi.is_representative, 'spice', mi.operator_spice_level, 'spice_source', mi.spice_source,
               'community_spice', private.spice_summary(mi.id),
               'my_spice', (select level from public.menu_spice_votes v where v.menu_item_id = mi.id and v.device_id = dev),
               'food_code', (select code from public.normalized_items where id = mi.normalized_item_id),
               'kind', (select kind from public.categories where code = st.category_code)
             ) order by mi.is_representative desc, mi.display_order), '[]')
             from public.stall_menu_items mi where mi.stall_id = st.id and mi.deleted_at is null and mi.is_active),
    'review_summary', (select jsonb_build_object('avg', round(avg(rating)::numeric, 1), 'count', count(*),
                         'taste', round(avg(taste)::numeric, 1), 'value', round(avg(value)::numeric, 1), 'kindness', round(avg(kindness)::numeric, 1))
                       from public.reviews where stall_id = st.id and deleted_at is null and status = 'visible'),
    'reviews', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
                  select r.id, r.nickname, r.rating, r.original_language, r.original_text, r.price_matched, r.created_at,
                         (select coalesce(jsonb_object_agg(locale, translated_text), '{}') from public.review_translations t where t.review_id = r.id) as translations
                  from public.reviews r where r.stall_id = st.id and r.deleted_at is null and r.status = 'visible'
                  order by r.created_at desc limit 30) x),
    'photos', (select coalesce(jsonb_agg(x order by x.score desc, x.created_at desc), '[]') from (
                 select ph.id, ph.storage_path, ph.kind, ph.created_at,
                        count(v.*) filter (where v.vote = 1) as up, count(v.*) filter (where v.vote = -1) as down,
                        coalesce(sum(v.vote), 0) + case when ph.is_pinned then 1000 else 0 end as score,
                        max(v.vote) filter (where v.device_id = dev) as my_vote
                 from public.photos ph left join public.photo_votes v on v.photo_id = ph.id
                 where ph.stall_id = st.id and ph.deleted_at is null and ph.status = 'visible'
                 group by ph.id limit 60) x),
    'payments', (select jsonb_build_object(
                   'card_worked', count(*) filter (where kind = 'card_worked'), 'card_failed', count(*) filter (where kind = 'card_failed'),
                   'cash_used', count(*) filter (where kind = 'cash_used'), 'last_at', max(observed_at))
                 from public.payment_observations where stall_id = st.id and observed_at > now() - interval '120 days'),
    'dietary', (select coalesce(jsonb_agg(jsonb_build_object('claim', claim, 'verified', is_verified, 'menu_item_id', menu_item_id)), '[]')
                from public.dietary_claims where stall_id = st.id and deleted_at is null),
    'last_verified_at', (select max(observed_at) from public.observations o where o.stall_id = st.id and o.result in ('INITIAL', 'SAME', 'CHANGED')),
    'updated_at', greatest(st.updated_at, (select max(updated_at) from public.stall_menu_items where stall_id = st.id))
  );
end $$;

-- Weekly rating ranking with Bayesian shrinkage toward the window mean (§23). Formula is internal only.
create or replace function private.ranked(p_days integer, p_min_reviews integer default 3)
returns table (stall_id uuid, score numeric, avg_rating numeric, review_count bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  with w as (
    select r.stall_id, r.rating from public.reviews r
    join public.stalls st on st.id = r.stall_id and st.deleted_at is null and st.is_active
    where r.deleted_at is null and r.status = 'visible' and r.created_at > now() - make_interval(days => p_days)
  ), c as (select coalesce(avg(rating), 4.0) as mean from w),
  per as (select stall_id, avg(rating) as av, count(*) as n from w group by stall_id)
  select per.stall_id, ((per.n * per.av + 5 * c.mean) / (per.n + 5))::numeric as score, round(per.av::numeric, 1), per.n
  from per, c where per.n >= p_min_reviews
  order by score desc, per.n desc
$$;

create or replace function public.public_rankings(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  return (with r as (
      select rk.*, st.category_code, row_number() over (order by rk.score desc, rk.review_count desc) as overall_rank,
             row_number() over (partition by st.category_code order by rk.score desc, rk.review_count desc) as cat_rank,
             private.stall_card(st, s) as card
      from private.ranked(7) rk
      join public.stalls st on st.id = rk.stall_id
      join public.stall_spot_assignments a on a.stall_id = st.id and a.ended_at is null
      join public.spots s on s.id = a.spot_id and s.status = 'active')
    select jsonb_build_object(
      'overall', (select coalesce(jsonb_agg(card || jsonb_build_object('rank', overall_rank, 'week_avg', avg_rating, 'week_count', review_count) order by overall_rank), '[]')
                  from r where overall_rank <= 20),
      'by_category', (select coalesce(jsonb_object_agg(category_code, lst), '{}') from (
                        select category_code, jsonb_agg(card || jsonb_build_object('rank', cat_rank, 'week_avg', avg_rating, 'week_count', review_count) order by cat_rank) lst
                        from r where cat_rank <= 3 group by category_code) x)));
end $$;

create or replace function public.public_search(p_secret text, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', '', 'g'));
begin
  perform private.require_server(p_secret);
  if length(q) < 1 or length(q) > 40 then return '{"stalls":[],"foods":[]}'::jsonb; end if;
  return jsonb_build_object(
    'foods', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name_i18n', name_i18n)), '[]') from (
                select distinct ni.code, ni.name_i18n from public.normalized_items ni
                where exists (select 1 from unnest(ni.search_terms) t where position(q in lower(regexp_replace(t, '\s+', '', 'g'))) > 0)
                   or exists (select 1 from jsonb_each_text(ni.name_i18n) e where position(q in lower(regexp_replace(e.value, '\s+', '', 'g'))) > 0)
                limit 8) f),
    'stalls', (select coalesce(jsonb_agg(private.stall_card(st, s)), '[]') from (
                 select distinct st.id from public.stalls st
                 left join public.stall_menu_items mi on mi.stall_id = st.id and mi.deleted_at is null and mi.is_active
                 left join public.normalized_items ni on ni.id = mi.normalized_item_id
                 left join public.stall_localizations lo on lo.stall_id = st.id
                 where st.deleted_at is null and st.is_active and (
                   position(q in lower(regexp_replace(mi.display_name, '\s+', '', 'g'))) > 0
                   or exists (select 1 from unnest(ni.search_terms) t where position(q in lower(regexp_replace(t, '\s+', '', 'g'))) > 0)
                   or exists (select 1 from jsonb_each_text(ni.name_i18n) e where position(q in lower(regexp_replace(e.value, '\s+', '', 'g'))) > 0)
                   or position(q in lower(regexp_replace(coalesce(lo.display_name, ''), '\s+', '', 'g'))) > 0
                   or position(q in lower(regexp_replace(coalesce(st.official_name, ''), '\s+', '', 'g'))) > 0)
                 limit 40) ids
               join public.stalls st on st.id = ids.id
               join public.stall_spot_assignments a on a.stall_id = st.id and a.ended_at is null
               join public.spots s on s.id = a.spot_id and s.status = 'active'));
end $$;

create or replace function public.public_food(p_secret text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  return (select jsonb_build_object('code', ni.code, 'name_i18n', ni.name_i18n,
            'subcategory', (select code from public.subcategories where id = ni.subcategory_id),
            'stalls', (select coalesce(jsonb_agg(private.stall_card(st, s) || jsonb_build_object('item_price', private.price_json(mi))), '[]')
                       from public.stall_menu_items mi
                       join public.stalls st on st.id = mi.stall_id and st.deleted_at is null and st.is_active
                       join public.stall_spot_assignments a on a.stall_id = st.id and a.ended_at is null
                       join public.spots s on s.id = a.spot_id and s.status = 'active'
                       where mi.normalized_item_id = ni.id and mi.deleted_at is null and mi.is_active))
          from public.normalized_items ni where ni.code = p_code);
end $$;

-- Sitemap only lists URLs (slug + lastmod), never data.
create or replace function public.public_sitemap(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  return jsonb_build_object(
    'stalls', (select coalesce(jsonb_agg(jsonb_build_object('slug', st.slug, 'updated_at', st.updated_at)), '[]')
               from public.stalls st join public.stall_spot_assignments a on a.stall_id = st.id and a.ended_at is null
               where st.deleted_at is null and st.is_active),
    'foods', (select coalesce(jsonb_agg(distinct ni.code), '[]') from public.normalized_items ni
              join public.stall_menu_items mi on mi.normalized_item_id = ni.id and mi.deleted_at is null));
end $$;

-- "Which stall did you visit?" — nearest candidates; the user picks (§59). GPS never decides alone.
create or replace function public.public_nearby_stalls(p_secret text, p_lat double precision, p_lng double precision) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  return (select coalesce(jsonb_agg(card order by d), '[]') from (
    select private.stall_card(st, s) || jsonb_build_object('distance_m', round(private.dist_m(p_lat, p_lng, s.raw_lat, s.raw_lng)::numeric)) as card,
           private.dist_m(p_lat, p_lng, s.raw_lat, s.raw_lng) d
    from public.spots s
    join public.stall_spot_assignments a on a.spot_id = s.id and a.ended_at is null
    join public.stalls st on st.id = a.stall_id and st.deleted_at is null and st.is_active
    where s.status = 'active' and abs(s.raw_lat - p_lat) < 0.001 and abs(s.raw_lng - p_lng) < 0.0012
    order by d limit 6) x where d <= 80);
end $$;

-- ───────────── public writes (anonymous device) ─────────────
-- p_level null removes the vote. One active vote per device per menu item (§50).
create or replace function public.public_spice_vote(p_secret text, p_device_token text, p_item uuid, p_level smallint) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare dev uuid;
begin
  perform private.require_server(p_secret);
  dev := private.device_from_token(p_device_token);
  perform private.rate_limit('spice:' || dev, 60, 3600);
  if not exists (select 1 from public.stall_menu_items mi join public.categories c on c.code = (select category_code from public.stalls where id = mi.stall_id)
                 where mi.id = p_item and mi.deleted_at is null and c.kind = 'food') then
    raise exception 'menu item not found' using errcode = '22023';
  end if;
  if p_level is null then
    delete from public.menu_spice_votes where menu_item_id = p_item and device_id = dev;
  else
    if p_level not between 0 and 3 then raise exception 'invalid level' using errcode = '22023'; end if;
    insert into public.menu_spice_votes (menu_item_id, device_id, level) values (p_item, dev, p_level)
    on conflict (menu_item_id, device_id) do update set level = excluded.level, updated_at = now();
  end if;
  return private.spice_summary(p_item) || jsonb_build_object('mine', p_level);
end $$;

-- Same vote again removes it; opposite vote switches (§65). Does not affect stall rating.
create or replace function public.public_photo_vote(p_secret text, p_device_token text, p_photo uuid, p_vote smallint) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare dev uuid; cur smallint; mine smallint;
begin
  perform private.require_server(p_secret);
  dev := private.device_from_token(p_device_token);
  perform private.rate_limit('photo:' || dev, 120, 3600);
  if p_vote not in (-1, 1) then raise exception 'invalid vote' using errcode = '22023'; end if;
  if not exists (select 1 from public.photos where id = p_photo and deleted_at is null and status = 'visible') then
    raise exception 'photo not found' using errcode = '22023';
  end if;
  select vote into cur from public.photo_votes where photo_id = p_photo and device_id = dev;
  if cur = p_vote then
    delete from public.photo_votes where photo_id = p_photo and device_id = dev; mine := null;
  else
    insert into public.photo_votes (photo_id, device_id, vote) values (p_photo, dev, p_vote)
    on conflict (photo_id, device_id) do update set vote = excluded.vote; mine := p_vote;
  end if;
  return (select jsonb_build_object('up', count(*) filter (where vote = 1), 'down', count(*) filter (where vote = -1), 'mine', mine)
          from public.photo_votes where photo_id = p_photo);
end $$;

-- Review: star rating is the only required field (§61). Facts become observations, never overwrite data.
create or replace function public.public_submit_review(p_secret text, p_device_token text, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare dev uuid; st uuid := (p ->> 'stall_id')::uuid; rid uuid; txt text := nullif(trim(coalesce(p ->> 'text', '')), '');
begin
  perform private.require_server(p_secret);
  dev := private.device_from_token(p_device_token);
  perform private.rate_limit('review:' || dev, 20, 86400);
  perform private.rate_limit('review:' || dev || ':' || st, 1, 3600);
  if not exists (select 1 from public.stalls where id = st and deleted_at is null) then
    raise exception 'stall not found' using errcode = '22023';
  end if;
  insert into public.reviews (stall_id, device_id, nickname, rating, taste, value, kindness, price_matched, open_now,
                              original_language, original_text)
  values (st, dev, nullif(left(trim(coalesce(p ->> 'nickname', '')), 30), ''), (p ->> 'rating')::smallint,
          nullif(p ->> 'taste', '')::smallint, nullif(p ->> 'value', '')::smallint, nullif(p ->> 'kindness', '')::smallint,
          (p ->> 'price_matched')::boolean, (p ->> 'open_now')::boolean,
          case when txt is null then null else left(coalesce(p ->> 'language', 'ko'), 8) end, txt)
  returning id into rid;
  if p ->> 'payment' in ('card_worked', 'card_failed', 'cash_used') then
    insert into public.payment_observations (stall_id, kind, source, device_id) values (st, (p ->> 'payment')::public.payment_kind, 'REVIEW', dev);
  end if;
  if (p ->> 'price_matched')::boolean is false then
    insert into public.reports (stall_id, device_id, kind, payload) values (st, dev, 'price_changed', jsonb_build_object('review_id', rid));
  end if;
  return jsonb_build_object('review_id', rid);
end $$;

create or replace function public.public_submit_report(p_secret text, p_device_token text, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare dev uuid; rid uuid;
begin
  perform private.require_server(p_secret);
  dev := private.device_from_token(p_device_token);
  perform private.rate_limit('report:' || dev, 20, 86400);
  insert into public.reports (stall_id, menu_item_id, device_id, kind, payload)
  values (nullif(p ->> 'stall_id', '')::uuid, nullif(p ->> 'menu_item_id', '')::uuid, dev, p ->> 'kind',
          jsonb_strip_nulls(jsonb_build_object('text', left(p ->> 'text', 500), 'price', nullif(p ->> 'price', '')::int,
                                               'lat', nullif(p ->> 'lat', '')::float8, 'lng', nullif(p ->> 'lng', '')::float8)))
  returning id into rid;
  return jsonb_build_object('report_id', rid);
end $$;

-- Translation cache written by the server after calling a translation provider.
create or replace function public.public_cache_review_translation(p_secret text, p_review uuid, p_locale text, p_text text, p_provider text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform private.require_server(p_secret);
  insert into public.review_translations (review_id, locale, translated_text, provider)
  values (p_review, p_locale, left(p_text, 2000), p_provider)
  on conflict (review_id, locale) do update set translated_text = excluded.translated_text, provider = excluded.provider;
end $$;
