-- Two-sided streets: one centre line + width → left/right edges; spots attach to their own side.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'street@test') on conflict do nothing;
insert into public.admin_profiles (user_id, role) values ('00000000-0000-0000-0000-0000000000f1', 'field_worker') on conflict do nothing;

begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
-- north-south street along lng 126.9900, width 12 m
insert into r values ('g', to_jsonb(public.admin_save_street(null, 'test street', '[[37.5610,126.9900],[37.5640,126.9900]]', 12)));
-- spot 4 m west of centre (left when travelling north), spot 5 m east (right)
insert into r values ('w', public.field_create_spot('{"lat":37.5625,"lng":126.989955,"category_code":"snack"}'));
insert into r values ('e', public.field_create_spot('{"lat":37.5626,"lng":126.990057,"category_code":"snack"}'));
commit;

do $$
declare g uuid := (select (v #>> '{}')::uuid from r where k = 'g'); lw record; rw record; sw public.spots; se public.spots;
begin
  select * into lw from stall_display_lines where street_group = g and side = 'left';
  select * into rw from stall_display_lines where street_group = g and side = 'right';
  assert lw.id is not null and rw.id is not null, 'two edges created';
  assert abs(private.dist_m((lw.path->0->>0)::float8, (lw.path->0->>1)::float8, (rw.path->0->>0)::float8, (rw.path->0->>1)::float8) - 12) < 0.05, 'edges are 12 m apart';
  assert (lw.path->0->>1)::float8 < 126.99 and (rw.path->0->>1)::float8 > 126.99, 'left edge is west when travelling north';
  select * into sw from spots where id = (select (v->>'spot_id')::uuid from r where k = 'w');
  select * into se from spots where id = (select (v->>'spot_id')::uuid from r where k = 'e');
  assert sw.display_line_id = lw.id, 'west spot on left edge';
  assert se.display_line_id = rw.id, 'east spot on right edge';
  assert sw.raw_lng = 126.989955, 'raw coordinate untouched';
end $$;

-- widen the street: edges move, spots re-projected, still one line per side
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
select public.admin_save_street((select (v #>> '{}')::uuid from r where k = 'g'), null, '[[37.5610,126.9900],[37.5640,126.9900]]', 16);
commit;
do $$ begin
  assert (select count(*) from stall_display_lines where street_group = (select (v #>> '{}')::uuid from r where k = 'g') and deleted_at is null) = 2, 'still two edges after update';
  assert (select width_m from stall_display_lines where side = 'left' and street_group = (select (v #>> '{}')::uuid from r where k = 'g')) = 16, 'width updated';
end $$;

begin;
set local role anon;
do $$ begin
  begin perform public.admin_save_street(null, 'x', '[[37.56,126.99],[37.561,126.99]]', 12); raise exception 'anon must not call';
  exception when insufficient_privilege then null; end;
end $$;
commit;
\echo 'street tests passed'
