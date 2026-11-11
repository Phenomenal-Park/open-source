-- SQL acceptance tests (run with: npm run db:test). Runs against local Postgres + supabase/local-shim.sql.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create temp table r (k text primary key, v jsonb);
grant all on r to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test'),
  ('00000000-0000-0000-0000-00000000000f', 'field@test'),
  ('00000000-0000-0000-0000-00000000000e', 'random@test');
insert into public.admin_profiles (user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-00000000000f', 'field_worker');
update public.app_settings set server_secret_hash = encode(sha256('test-server-secret'::bytea), 'hex');

-- helper: expect an error
create or replace function pg_temp.expect_error(sql text, frag text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error containing "%" for: %', frag, sql;
exception when others then
  if position(frag in sqlerrm) = 0 then raise exception 'expected "%", got "%" for: %', frag, sqlerrm, sql; end if;
end $$;

-- ───── 1. anon: no table access, no admin RPCs ─────
begin;
set local role anon;
select pg_temp.expect_error('select * from public.spots', 'permission denied');
select pg_temp.expect_error('select * from public.reviews', 'permission denied');
select pg_temp.expect_error('select public.field_status()', 'permission denied');
select pg_temp.expect_error('select public.public_reference(null)', 'forbidden');
select pg_temp.expect_error('select public.public_reference(''wrong'')', 'forbidden');
commit;

-- ───── 2. authenticated but NOT an admin ─────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","aal":"aal1"}', true);
select pg_temp.expect_error('select public.field_status()', 'not authorized');
select pg_temp.expect_error($q$select public.field_create_spot('{"lat":37.5627,"lng":126.985,"category_code":"snack"}')$q$, 'not authorized');
do $$ begin assert (select count(*) from public.spots) = 0, 'non-staff must see 0 rows'; end $$;
select pg_temp.expect_error('insert into public.spots (area_id, m_number, raw_lat, raw_lng) values (gen_random_uuid(), 1, 1, 1)', 'permission denied');
commit;

-- ───── 3. Field creation acceptance (§135) ─────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","aal":"aal1"}', true);
insert into r values ('status0', public.field_status());
insert into r values ('s1', public.field_create_spot($j${
  "client_request_id":"11111111-1111-1111-1111-111111111111",
  "lat":37.56300,"lng":126.98450,"category_code":"dessert_fruit",
  "hint":{"landmark_id":null},
  "items":[{"name":"딸기모찌","price":5000,"spice":null},
           {"name":"초코모찌","price":5000,"spice":0},
           {"name":"매운 무언가","price":null,"spice":3},
           {"name":"   ","price":null},{"name":"","price":""}],
  "hours":null}$j$));
insert into r values ('status1', public.field_status());
commit;

do $$
declare sp uuid := (select (v->>'spot_id')::uuid from r where k = 's1'); st uuid := (select (v->>'stall_id')::uuid from r where k = 's1');
begin
  assert (select v->>'next_m' from r where k = 'status0') = '1', 'empty DB → next M-001';
  assert (select v->>'m_number' from r where k = 's1') = '1', 'first save gets M-001';
  assert (select v->>'o_number' from r where k = 's1') = '1', 'first save gets O-001';
  assert (select v->>'next_m' from r where k = 'status1') = '2', 'header becomes next M-002';
  assert (select count(*) from stall_menu_items where stall_id = st) = 3, 'only 3 non-empty rows persist';
  assert (select display_name from stall_menu_items where stall_id = st and is_representative) = '딸기모찌', 'first item representative';
  assert (select hours_mode::text from stalls where id = st) = 'DEFAULT', 'default hours inherited';
  assert (select count(*) from weekly_hours_overrides where stall_id = st) = 0, 'no override rows for default';
  assert (select normalized_item_id is not null from stall_menu_items where stall_id = st and display_name = '딸기모찌'), 'normalized match';
  assert (select operator_spice_level from stall_menu_items where stall_id = st and display_name = '초코모찌') = 0, 'spice 0 stored';
  assert (select operator_spice_level is null from stall_menu_items where stall_id = st and display_name = '딸기모찌'), 'unknown spice is null';
  assert (select spice_source::text from stall_menu_items where stall_id = st and display_name = '매운 무언가') = 'FIELD_OBSERVED', 'spice source';
  assert (select price_type::text from stall_menu_items where stall_id = st and display_name = '매운 무언가') = 'UNKNOWN', 'no price → UNKNOWN';
  assert (select count(*) from observations where spot_id = sp and result = 'INITIAL') = 1, 'initial observation';
  assert (select count(*) from stall_spot_assignments where spot_id = sp and ended_at is null) = 1, 'assignment';
  assert (select count(*) from price_observations po join stall_menu_items mi on mi.id = po.menu_item_id where mi.stall_id = st) = 2, 'price history';
  assert (select slug like 'strawberry-mochi-%' from stalls where id = st), 'descriptive slug';
  assert (select count(*) from audit_logs where table_name = 'spots' and action = 'insert' and actor_id = '00000000-0000-0000-0000-00000000000f') = 1, 'audited with actor';
end $$;

-- idempotent replay + cancelled/failed creation does not consume an M number
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
insert into r values ('replay', public.field_create_spot($j${"client_request_id":"11111111-1111-1111-1111-111111111111","lat":37.563,"lng":126.9845,"category_code":"snack"}$j$));
select pg_temp.expect_error($q$select public.field_create_spot('{"lat":37.5631,"lng":126.9845,"category_code":"nope"}')$q$, 'invalid category');
select pg_temp.expect_error($q$select public.field_create_spot('{"lat":37.0,"lng":126.0,"category_code":"snack"}')$q$, 'outside area');
insert into r values ('status2', public.field_status());
insert into r values ('s2', public.field_create_spot($j${"lat":37.56320,"lng":126.98455,"category_code":"fried_bunsik",
  "items":[{"name":"떡볶이","price":5000,"spice":2},{"name":"어묵","price":3000,"spice":0},{"name":"닭꼬치","price":6000,"spice":1},
           {"name":"매운 닭꼬치","price":7000,"spice":3},{"name":"순대","price":5000},{"name":"튀김","price_type":"RANGE","price_min":3000,"price_max":6000}],
  "hours":{"mode":"CUSTOM","days":[{"weekday":1,"is_open":false,"open_min":960,"close_min":1440},{"weekday":2,"open_min":960,"close_min":1440},
     {"weekday":3,"open_min":960,"close_min":1440},{"weekday":4,"open_min":960,"close_min":1440},{"weekday":5,"open_min":1020,"close_min":1560},
     {"weekday":6,"open_min":780,"close_min":1560},{"weekday":7,"open_min":780,"close_min":1440}]}}$j$));
-- missed spot inserted between M-001 and M-002 (§76)
insert into r values ('s3', public.field_create_spot(jsonb_build_object('lat',37.56310,'lng',126.98452,'category_code','fashion_goods',
  'items', '[{"name":"양말","price_type":"VARIES"}]'::jsonb, 'insert_after_spot_id', (select v->>'spot_id' from r where k = 's1'))));
insert into r values ('nearby', public.field_nearby_spots(37.56301, 126.98451, 12));
insert into r values ('route', public.field_route(null));
commit;

do $$ begin
  assert (select (v->>'replayed')::boolean from r where k = 'replay'), 'replay detected';
  assert (select v->>'next_m' from r where k = 'status2') = '2', 'failed saves do not consume M';
  assert (select v->>'m_number' from r where k = 's2') = '2', 'second spot M-002';
  assert (select v->>'menu_count' from r where k = 's2') = '6', 'more than five items';
  assert (select v->>'m_number' from r where k = 's3') = '3', 'missed spot gets next M (M-003)';
  assert (select v->>'o_number' from r where k = 's3') = '2', 'missed spot gets O-002';
  assert (select string_agg(i->>'m_number', ',' order by (i->>'o_number')::int) from r, jsonb_array_elements(v->'items') i where k = 'route') = '1,3,2',
    'O order regenerated: O1→M1, O2→M3, O3→M2';
  assert (select jsonb_array_length(v) from r where k = 'nearby') >= 1, 'nearby warning finds M-001';
  assert (select (v->0->>'m_number') from r where k = 'nearby') = '1', 'closest first';
  assert (select hours_mode::text from stalls s join stall_spot_assignments a on a.stall_id = s.id where a.spot_id = (select (v->>'spot_id')::uuid from r where k='s2')) = 'CUSTOM', 'custom hours';
  assert (select close_min from weekly_hours_overrides w join stall_spot_assignments a on a.stall_id = w.stall_id
          where a.spot_id = (select (v->>'spot_id')::uuid from r where k='s2') and weekday = 5) = 1560, 'after-midnight close stored';
end $$;

-- ───── 4. Concurrency-safe M allocation is covered by tests/m_concurrency.sh ─────

-- ───── 5. Patrol (§136) ─────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
insert into r values ('o_same', public.field_record_observation(jsonb_build_object('spot_id', (select v->>'spot_id' from r where k='s1'), 'result', 'SAME')));
insert into r values ('o_none', public.field_record_observation(jsonb_build_object('spot_id', (select v->>'spot_id' from r where k='s3'), 'result', 'NO_STALL')));
insert into r values ('o_unc',  public.field_record_observation(jsonb_build_object('spot_id', (select v->>'spot_id' from r where k='s2'), 'result', 'UNCERTAIN')));
select pg_temp.expect_error($q$select public.field_record_observation(jsonb_build_object('spot_id', gen_random_uuid(), 'result', 'CHANGED'))$q$, 'field_apply_change');
-- change: price change on 떡볶이, remove 순대, add 2 items, flag representative
insert into r values ('chg', public.field_apply_change(jsonb_build_object(
  'spot_id', (select v->>'spot_id' from r where k='s2'),
  'items', (select jsonb_agg(case when display_name = '떡볶이' then jsonb_build_object('id', id, 'name', display_name, 'price', 5500, 'spice', operator_spice_level)
                                  else jsonb_build_object('id', id, 'name', display_name, 'price', price_amount, 'price_type', price_type,
                                                          'price_min', price_min, 'price_max', price_max, 'spice', operator_spice_level,
                                                          'is_representative', display_name = '어묵') end order by display_order)
            from stall_menu_items where stall_id = (select (v->>'stall_id')::uuid from r where k='s2') and display_name <> '순대' and deleted_at is null)
            || '[{"name":"김말이","price":1000},{"name":"만두","price":4000}]'::jsonb)));
-- different stall now occupies M-003
insert into r values ('occ', public.field_apply_change(jsonb_build_object('spot_id', (select v->>'spot_id' from r where k='s3'),
  'new_occupant', true, 'category_code', 'snack', 'items', '[{"name":"호떡","price":2000}]'::jsonb)));
commit;

do $$
declare st2 uuid := (select (v->>'stall_id')::uuid from r where k = 's2');
begin
  assert (select status::text from spots where id = (select (v->>'spot_id')::uuid from r where k='s3')) = 'active', 'NO_STALL keeps spot active';
  assert (select count(*) from observations where result = 'NO_STALL') = 1, 'NO_STALL saved';
  assert (select count(*) from observations where result = 'UNCERTAIN') = 1, 'UNCERTAIN saved';
  assert (select count(*) from observations where result = 'SAME' and stall_id is not null) = 1, 'SAME saved with stall';
  assert (select price_amount from stall_menu_items where stall_id = st2 and display_name = '떡볶이' and deleted_at is null) = 5500, 'price updated';
  assert (select count(*) from price_observations po join stall_menu_items mi on mi.id = po.menu_item_id where mi.display_name = '떡볶이') = 2, 'price history kept';
  assert (select deleted_at is not null from stall_menu_items where stall_id = st2 and display_name = '순대'), '순대 soft-deleted, not destroyed';
  assert (select count(*) from stall_menu_items where stall_id = st2 and deleted_at is null) = 7, '7 active items';
  assert (select display_name from stall_menu_items where stall_id = st2 and is_representative and deleted_at is null) = '어묵', 'representative changed';
  assert (select count(*) from stall_spot_assignments where spot_id = (select (v->>'spot_id')::uuid from r where k='s3')) = 2, 'occupancy history kept';
  assert (select count(*) from stall_spot_assignments where spot_id = (select (v->>'spot_id')::uuid from r where k='s3') and ended_at is null) = 1, 'one current occupant';
  assert (select count(*) from observations where spot_id = (select (v->>'spot_id')::uuid from r where k='s3')) = 3, 'history intact (INITIAL, NO_STALL, CHANGED)';
end $$;

-- ───── 6. Display lines + projection, merge ─────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
insert into r values ('line', to_jsonb(public.admin_save_display_line(null, 'test street', '[[37.5625,126.98448],[37.5640,126.98448]]'::jsonb)));
-- field worker may not merge (admin+ only)
select pg_temp.expect_error(format('select public.admin_merge_spots(%L, %L)', (select v->>'spot_id' from r where k='s3'), (select v->>'spot_id' from r where k='s1')), 'insufficient role');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
insert into r values ('dup', public.field_create_spot($j${"lat":37.563005,"lng":126.984505,"category_code":"dessert_fruit","items":[{"name":"딸기모찌","price":5000}]}$j$));
select public.admin_merge_spots((select (v->>'spot_id')::uuid from r where k='dup'), (select (v->>'spot_id')::uuid from r where k='s1'));
insert into r values ('status3', public.field_status());
commit;

do $$
declare s public.spots;
begin
  select * into s from spots where id = (select (v->>'spot_id')::uuid from r where k = 's1');
  assert s.display_line_id is not null, 'spot projected onto display line';
  assert abs(s.display_lng - 126.98448) < 0.000001, 'display point on the line';
  assert s.raw_lng = 126.98450, 'raw coordinate preserved';
  select * into s from spots where id = (select (v->>'spot_id')::uuid from r where k = 'dup');
  assert s.status = 'merged_duplicate' and s.m_number = 4, 'duplicate keeps M-004 and is marked';
  assert (select v->>'next_m' from r where k = 'status3') = '5', 'merged number never reused';
  assert not exists (select 1 from patrol_route_spots where spot_id = s.id), 'merged removed from route';
  assert (select count(*) from observations where spot_id = s.id) = 0, 'observations moved to target';
end $$;

-- ───── 7. MFA enforcement ─────
update public.app_settings set require_mfa = true;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', true);
select pg_temp.expect_error('select public.field_status()', 'not authorized');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', true);
select public.field_status();
commit;
update public.app_settings set require_mfa = false;

\echo 'field + security tests passed'

-- ───── 8. private schema hygiene: API roles cannot call internal helpers ─────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
select pg_temp.expect_error('select private.make_slug(''x'')', 'permission denied');
select pg_temp.expect_error('select private.rate_limit(''x'', 1, 1)', 'permission denied');
commit;
begin;
set local role anon;
select pg_temp.expect_error('select private.is_staff()', 'permission denied');
commit;
\echo 'private schema hygiene passed'
