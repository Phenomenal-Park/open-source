-- Public RPC tests: server-secret gate, viewport limits, spice/photo votes, reviews, ranking.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create temp table r (k text primary key, v jsonb);
grant all on r to anon;
create or replace function pg_temp.expect_error(sql text, frag text) returns void language plpgsql as $$
begin execute sql; raise exception 'expected error "%" for: %', frag, sql;
exception when others then if position(frag in sqlerrm) = 0 then raise exception 'expected "%", got "%"', frag, sqlerrm; end if; end $$;

-- photo for vote tests (inserted as owner)
insert into public.photos (stall_id, storage_path, kind)
select id, 'test/photo.jpg', 'food' from public.stalls where slug like 'strawberry-mochi-%' and deleted_at is null limit 1;

begin;
set local role anon;
select pg_temp.expect_error('select public.public_map_stalls(''test-server-secret'', 37.0, 126.0, 37.9, 127.9)', 'viewport too large');
insert into r values ('map', public.public_map_stalls('test-server-secret', 37.560, 126.980, 37.567, 126.990));
insert into r values ('ref', public.public_reference('test-server-secret'));
commit;

do $$ begin
  assert jsonb_array_length((select v->'stalls' from r where k='map')) = 3, 'three active stalls (merged dup excluded)';
  assert not ((select v from r where k='map')::text like '%m_number%'), 'no M numbers in public payload';
  assert not ((select v from r where k='map')::text like '%o_number%'), 'no O numbers in public payload';
  assert jsonb_array_length((select v->'categories' from r where k='ref')) = 5, 'five categories';
  assert (select count(*) from jsonb_array_elements((select v->'subcategories' from r where k='ref')) s group by s->>'category_code' order by 1 desc limit 1) <= 10, 'max 10 subcategories';
end $$;

-- spice votes
begin;
set local role anon;
insert into r values ('slug', to_jsonb((select 1)));  -- placeholder
commit;
create temp table ids as select mi.id as item, (select id from public.photos limit 1) as photo, s.id as stall, s.slug
  from public.stall_menu_items mi join public.stalls s on s.id = mi.stall_id where mi.display_name = '떡볶이' and mi.deleted_at is null;
grant select on ids to anon;
begin;
set local role anon;
insert into r values ('v1', public.public_spice_vote('test-server-secret', repeat('a', 40), (select item from ids), 3::smallint));
insert into r values ('v1b', public.public_spice_vote('test-server-secret', repeat('a', 40), (select item from ids), 2::smallint)); -- change vote
insert into r values ('v2', public.public_spice_vote('test-server-secret', repeat('b', 40), (select item from ids), 3::smallint));
insert into r values ('v3', public.public_spice_vote('test-server-secret', repeat('c', 40), (select item from ids), 3::smallint));
insert into r values ('v3x', public.public_spice_vote('test-server-secret', repeat('c', 40), (select item from ids), null)); -- remove
select pg_temp.expect_error('select public.public_spice_vote(''test-server-secret'', ''short'', (select item from ids), 1::smallint)', 'invalid device');
-- photo vote toggle
insert into r values ('p1', public.public_photo_vote('test-server-secret', repeat('a', 40), (select photo from ids), 1::smallint));
insert into r values ('p2', public.public_photo_vote('test-server-secret', repeat('a', 40), (select photo from ids), -1::smallint));
insert into r values ('p3', public.public_photo_vote('test-server-secret', repeat('a', 40), (select photo from ids), -1::smallint));
commit;

do $$ begin
  assert (select (v->>'count')::int from r where k='v1b') = 1, 'changing vote keeps one vote per device';
  assert (select (v->>'count')::int from r where k='v3x') = 2, 'removed vote';
  assert (select operator_spice_level from public.stall_menu_items where id = (select item from ids)) = 2, 'community never overwrites operator value';
  assert (select v->>'up' from r where k='p1') = '1', 'upvote';
  assert (select v->>'down' from r where k='p2') = '1' and (select v->>'up' from r where k='p2') = '0', 'switch vote';
  assert (select v->>'down' from r where k='p3') = '0', 'same vote again removes';
end $$;

-- reviews + ranking: 1×5.0 must not beat many 4.8s (§23)
do $$
declare i int; s1 uuid; s2 uuid;
begin
  select stall_id into s1 from public.stall_menu_items where display_name = '떡볶이' and deleted_at is null;
  select id into s2 from public.stalls where slug like 'strawberry-mochi-%' and deleted_at is null limit 1;
  for i in 1..1 loop
    perform public.public_submit_review('test-server-secret', repeat('z', 40), jsonb_build_object('stall_id', s1, 'rating', 5));
  end loop;
  for i in 1..20 loop
    perform public.public_submit_review('test-server-secret', md5(i::text) || md5('x'), jsonb_build_object('stall_id', s2, 'rating', case when i % 5 = 0 then 4 else 5 end, 'text', '맛있어요', 'language', 'ko', 'payment', 'card_worked'));
  end loop;
  -- only one review per stall per device per hour
  begin
    perform public.public_submit_review('test-server-secret', repeat('z', 40), jsonb_build_object('stall_id', s1, 'rating', 1));
    raise exception 'expected rate limit';
  exception when others then
    if sqlerrm <> 'rate limited' then raise; end if;
  end;
end $$;
insert into r values ('rank', public.public_rankings('test-server-secret'));
insert into r values ('detail', public.public_stall('test-server-secret', (select slug from ids), repeat('a', 40)));
insert into r values ('search', public.public_search('test-server-secret', 'strawberry'));
insert into r values ('search_ja', public.public_search('test-server-secret', 'いちご大福'));
do $$ begin
  assert (select v->'overall'->0->>'slug' from r where k='rank') like 'strawberry-mochi-%', '20 reviews of 4.8 beat a single 5.0 (min count)';
  assert jsonb_array_length((select v->'overall' from r where k='rank')) = 1, 'single-review stall excluded by minimum count';
  assert (select v->'menu'->0->>'name' from r where k='detail') = '어묵', 'representative first';
  assert (select (v->'menu') @> '[{"name":"떡볶이","my_spice":2}]' from r where k='detail'), 'my vote returned';
  assert jsonb_array_length((select v->'stalls' from r where k='search')) = 1, 'english search finds stall';
  assert jsonb_array_length((select v->'stalls' from r where k='search_ja')) = 1, 'japanese search finds stall';
end $$;
\echo 'public tests passed'
