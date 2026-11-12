-- ⚠️ LOCAL DEVELOPMENT DEMO DATA ONLY — NEVER APPLY TO PRODUCTION.
-- Fabricated stalls, menus, prices and reviews for UI testing. Street geometry is a rough approximation.
-- Real data comes only from the field survey (/admin/field).

-- distance (m) from a point to a [[lat,lng],…] polyline — used to keep demo stalls out of intersections
create function pg_temp.dist_to_path(p_lat float8, p_lng float8, p_path jsonb) returns float8 language plpgsql immutable as $f$
declare i int; k float8 := 111320 * cos(radians(p_lat)); ax float8; ay float8; bx float8; by_ float8; t float8; d float8 := 1e9;
begin
  for i in 0 .. jsonb_array_length(p_path) - 2 loop
    ax := ((p_path -> i ->> 1)::float8 - p_lng) * k; ay := ((p_path -> i ->> 0)::float8 - p_lat) * 110574;
    bx := ((p_path -> (i + 1) ->> 1)::float8 - p_lng) * k; by_ := ((p_path -> (i + 1) ->> 0)::float8 - p_lat) * 110574;
    t := greatest(0, least(1, -(ax * (bx - ax) + ay * (by_ - ay)) / nullif(power(bx - ax, 2) + power(by_ - ay, 2), 0)));
    d := least(d, sqrt(power(ax + t * (bx - ax), 2) + power(ay + t * (by_ - ay), 2)));
  end loop;
  return d;
end $f$;

do $$
declare
  owner constant text := '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';
  streets jsonb := '[
    {"name":"명동길 (DEMO)","width":16,"center":[[37.56525,126.98302],[37.56385,126.98392],[37.56255,126.98472],[37.56155,126.98522]]},
    {"name":"명동8나길 (DEMO)","width":12,"center":[[37.56500,126.98520],[37.56380,126.98575],[37.56250,126.98630],[37.56170,126.98665]]},
    {"name":"중앙로 (DEMO)","width":14,"center":[[37.56300,126.98250],[37.56290,126.98400],[37.56275,126.98560],[37.56262,126.98700]]},
    {"name":"좁은 골목 (DEMO)","width":6,"center":[[37.56352,126.98640],[37.56345,126.98770]]}
  ]';
  l jsonb; pts jsonb; i int; n int; seg int; t float8; vlat float8; vlng float8;
  cats text[] := array['fried_bunsik','skewer_grill','snack','dessert_fruit','fashion_goods'];
  menus jsonb := '{
    "fried_bunsik":[[["떡볶이",5000,2],["어묵",3000,0],["순대",5000,null],["튀김",4000,0]],[["핫도그",4500,0],["치즈 떡볶이",6000,1]],[["새우튀김",5000,0],["만두",4000,0]]],
    "skewer_grill":[[["닭꼬치",6000,1],["매운 닭꼬치",7000,3]],[["랍스터 구이",20000,0],["가리비 구이",10000,1]],[["큐브 스테이크",15000,0],["구운 치즈",5000,0]],[["양꼬치",8000,1],["소시지",4000,0]]],
    "snack":[[["호떡",2000,0],["계란빵",2500,0]],[["군밤",5000,0],["옥수수",4000,0],["은행",5000,0],["쥐포",5000,0]],[["회오리감자",5000,1]],[["붕어빵",3000,0]]],
    "dessert_fruit":[[["딸기모찌",5000,null],["초코모찌",5000,null],["녹차모찌",5000,null]],[["탕후루",4000,0]],[["생과일주스",6000,0],["과일컵",7000,0]],[["소프트 아이스크림",5000,0]]],
    "fashion_goods":[[["양말",null,null]],[["모자",15000,null]],[["휴대폰 케이스",10000,null]],[["액세서리",null,null]]]
  }';
  c text; m jsonb; it jsonb; items jsonb; res jsonb; k int := 0; sid uuid; j int;
begin
  perform set_config('request.jwt.claims', owner, true);
  for l in select * from jsonb_array_elements(streets) loop
    perform public.admin_save_street(null, l ->> 'name', l -> 'center', (l ->> 'width')::real);
  end loop;
  perform setseed(0.42);
  -- stalls along both sidewalk edges of every street
  for l in select jsonb_build_object('name', name, 'path', path, 'grp', street_group) from public.stall_display_lines where deleted_at is null order by name, side loop
    pts := l -> 'path'; n := case when (l ->> 'name') like '중앙로%' then 34 when (l ->> 'name') like '좁은%' then 9 else 44 end;
    for i in 0 .. n - 1 loop
      t := (i + 0.5) / n * (jsonb_array_length(pts) - 1);
      seg := least(floor(t)::int, jsonb_array_length(pts) - 2); t := t - seg;
      vlat := (pts -> seg ->> 0)::float8 * (1 - t) + (pts -> (seg + 1) ->> 0)::float8 * t + (random() - 0.5) * 0.00002;
      vlng := (pts -> seg ->> 1)::float8 * (1 - t) + (pts -> (seg + 1) ->> 1)::float8 * t + (random() - 0.5) * 0.00002;
      -- real stalls don't stand inside crossings: skip positions within another street's road + 8 m
      continue when exists (select 1 from public.stall_display_lines o
                            where o.deleted_at is null and o.side = 'left' and o.street_group <> (l ->> 'grp')::uuid
                              and pg_temp.dist_to_path(vlat, vlng, o.center_path) < o.width_m / 2 + 8);
      c := cats[1 + floor(random() * 5)::int];
      m := (menus -> c) -> floor(random() * jsonb_array_length(menus -> c))::int;
      items := '[]';
      for it in select * from jsonb_array_elements(m) loop
        items := items || jsonb_build_array(jsonb_build_object('name', it ->> 0, 'price', it -> 1, 'spice', it -> 2));
      end loop;
      res := public.field_create_spot(jsonb_build_object('lat', vlat, 'lng', vlng, 'category_code', c, 'items', items,
                                       'hint', jsonb_build_object('landmark_id', (select id from public.landmarks order by private.dist_m(vlat, vlng, landmarks.lat, landmarks.lng) limit 1))));
      k := k + 1;
      -- demo reviews on some stalls (through the real public RPC)
      if random() < 0.35 then
        sid := (res ->> 'stall_id')::uuid;
        for j in 1 .. 3 + floor(random() * 8)::int loop
          perform public.public_submit_review('local-dev-server-secret', md5(k::text || '-' || j) || md5('dev'),
            jsonb_build_object('stall_id', sid, 'rating', least(5, 3 + floor(random() * 3)::int), 'text', case when j = 1 then '맛있어요. 표시된 가격과 같았어요.' end,
                               'language', 'ko', 'payment', case when random() < 0.5 then 'card_worked' else 'cash_used' end));
        end loop;
      end if;
    end loop;
  end loop;
  -- one demo verified halal claim needs evidence; use a seller claim instead (honest default)
  insert into public.dietary_claims (stall_id, claim, source)
  select id, 'seller_claims_halal', 'DEMO' from public.stalls where category_code = 'skewer_grill' limit 2;
  raise notice 'demo seed: % spots', k;
end $$;
