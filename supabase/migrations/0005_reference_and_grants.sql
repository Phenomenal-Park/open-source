-- Production reference data + final explicit grant pass.
-- Landmark coordinates are approximate and MUST be verified in the field (docs/FIELD_OPERATIONS.md).

insert into public.areas (code, name_i18n, center_lat, center_lng, default_zoom)
values ('myeongdong', '{"ko":"명동","en":"Myeongdong","ja":"明洞","zh-cn":"明洞"}', 37.5627, 126.9850, 17);

-- §53 area defaults: Mon–Fri 16:00–24:00, Sat–Sun 13:00–24:00 (1440 = 24:00)
insert into public.area_default_hours (area_id, weekday, is_open, open_min, close_min)
select a.id, d, true, case when d <= 5 then 960 else 780 end, 1440
from public.areas a, generate_series(1, 7) d where a.code = 'myeongdong';

insert into public.categories (code, kind, sort_order, color, color_dark, name_i18n) values
 ('fried_bunsik',  'food',   1, '#E65454', '#D46A6A', '{"ko":"튀김·분식","en":"Fried & Bunsik","ja":"揚げ物・軽食","zh-cn":"炸物·小吃"}'),
 ('skewer_grill',  'food',   2, '#F28A30', '#D98B4A', '{"ko":"꼬치·구이","en":"Skewers & Grill","ja":"串・焼き物","zh-cn":"串烧·烤物"}'),
 ('snack',         'food',   3, '#2A9D8F', '#4A9E94', '{"ko":"간식·스낵","en":"Snacks","ja":"スナック","zh-cn":"零食·点心"}'),
 ('dessert_fruit', 'food',   4, '#D95C9F', '#C86F9F', '{"ko":"디저트·과일","en":"Dessert & Fruit","ja":"デザート・フルーツ","zh-cn":"甜品·水果"}'),
 ('fashion_goods', 'retail', 5, '#625CCB', '#7A75C9', '{"ko":"패션·잡화","en":"Fashion & Goods","ja":"ファッション・雑貨","zh-cn":"时尚·杂货"}');

insert into public.tags (code, name_i18n) values
 ('seafood', '{"ko":"해산물","en":"Seafood","ja":"シーフード","zh-cn":"海鲜"}');

insert into public.subcategories (category_code, code, sort_order, name_i18n) values
 ('fried_bunsik', 'tteokbokki', 1, '{"ko":"떡볶이","en":"Tteokbokki","ja":"トッポッキ","zh-cn":"炒年糕"}'),
 ('fried_bunsik', 'fish_cake', 2, '{"ko":"어묵","en":"Fish cake","ja":"おでん","zh-cn":"鱼饼"}'),
 ('fried_bunsik', 'fried', 3, '{"ko":"튀김","en":"Fried bites","ja":"天ぷら","zh-cn":"炸物"}'),
 ('fried_bunsik', 'sundae', 4, '{"ko":"순대","en":"Sundae","ja":"スンデ","zh-cn":"血肠"}'),
 ('fried_bunsik', 'dumplings', 5, '{"ko":"만두","en":"Dumplings","ja":"餃子","zh-cn":"饺子"}'),
 ('fried_bunsik', 'corn_dog', 6, '{"ko":"핫도그","en":"Corn dog","ja":"ハットグ","zh-cn":"热狗"}'),
 ('skewer_grill', 'chicken_skewer', 1, '{"ko":"닭꼬치","en":"Chicken skewer","ja":"焼き鳥","zh-cn":"鸡肉串"}'),
 ('skewer_grill', 'lamb_skewer', 2, '{"ko":"양꼬치","en":"Lamb skewer","ja":"羊串","zh-cn":"羊肉串"}'),
 ('skewer_grill', 'beef', 3, '{"ko":"소고기 구이","en":"Grilled beef","ja":"牛肉焼き","zh-cn":"烤牛肉"}'),
 ('skewer_grill', 'grilled_seafood', 4, '{"ko":"해산물 구이","en":"Grilled seafood","ja":"海鮮焼き","zh-cn":"烤海鲜"}'),
 ('skewer_grill', 'grilled_cheese', 5, '{"ko":"치즈 구이","en":"Grilled cheese","ja":"焼きチーズ","zh-cn":"烤芝士"}'),
 ('skewer_grill', 'sausage', 6, '{"ko":"소시지","en":"Sausage","ja":"ソーセージ","zh-cn":"香肠"}'),
 ('snack', 'hotteok', 1, '{"ko":"호떡","en":"Hotteok","ja":"ホットク","zh-cn":"糖饼"}'),
 ('snack', 'egg_bread', 2, '{"ko":"계란빵","en":"Egg bread","ja":"ケランパン","zh-cn":"鸡蛋面包"}'),
 ('snack', 'roasted', 3, '{"ko":"군밤·군고구마","en":"Roasted nuts & yams","ja":"焼き栗・焼き芋","zh-cn":"烤栗子·烤红薯"}'),
 ('snack', 'dried_seafood', 4, '{"ko":"건어물","en":"Dried seafood","ja":"干物","zh-cn":"鱼干"}'),
 ('snack', 'tornado_potato', 5, '{"ko":"회오리감자","en":"Tornado potato","ja":"トルネードポテト","zh-cn":"旋风土豆"}'),
 ('snack', 'fish_bread', 6, '{"ko":"붕어빵","en":"Fish bread","ja":"たい焼き","zh-cn":"鲷鱼烧"}'),
 ('snack', 'corn', 7, '{"ko":"옥수수","en":"Corn","ja":"とうもろこし","zh-cn":"玉米"}'),
 ('dessert_fruit', 'fresh_juice', 1, '{"ko":"생과일주스","en":"Fresh juice","ja":"生ジュース","zh-cn":"鲜榨果汁"}'),
 ('dessert_fruit', 'mochi', 2, '{"ko":"모찌","en":"Mochi","ja":"大福","zh-cn":"麻薯"}'),
 ('dessert_fruit', 'tanghulu', 3, '{"ko":"탕후루","en":"Tanghulu","ja":"タンフル","zh-cn":"糖葫芦"}'),
 ('dessert_fruit', 'fruit_cup', 4, '{"ko":"과일컵","en":"Fruit cup","ja":"フルーツカップ","zh-cn":"水果杯"}'),
 ('dessert_fruit', 'ice_cream', 5, '{"ko":"아이스크림","en":"Ice cream","ja":"アイス","zh-cn":"冰淇淋"}'),
 ('dessert_fruit', 'crepe_waffle', 6, '{"ko":"크레페·와플","en":"Crepes & waffles","ja":"クレープ・ワッフル","zh-cn":"可丽饼·华夫饼"}'),
 ('fashion_goods', 'clothing', 1, '{"ko":"의류","en":"Clothing","ja":"衣類","zh-cn":"服装"}'),
 ('fashion_goods', 'hats', 2, '{"ko":"모자","en":"Hats","ja":"帽子","zh-cn":"帽子"}'),
 ('fashion_goods', 'socks', 3, '{"ko":"양말","en":"Socks","ja":"靴下","zh-cn":"袜子"}'),
 ('fashion_goods', 'accessories', 4, '{"ko":"액세서리","en":"Accessories","ja":"アクセサリー","zh-cn":"饰品"}'),
 ('fashion_goods', 'toys', 5, '{"ko":"장난감","en":"Toys","ja":"おもちゃ","zh-cn":"玩具"}'),
 ('fashion_goods', 'souvenirs', 6, '{"ko":"기념품","en":"Souvenirs","ja":"お土産","zh-cn":"纪念品"}'),
 ('fashion_goods', 'phone_accessories', 7, '{"ko":"휴대폰 용품","en":"Phone accessories","ja":"スマホグッズ","zh-cn":"手机配件"}');

-- Normalized concepts. search_terms are matched exactly (whitespace-insensitive) when the field
-- operator types a menu name, so only list unambiguous synonyms. Never imply unknown specifics.
insert into public.normalized_items (code, subcategory_id, name_i18n, search_terms, tags)
select v.code, (select id from public.subcategories where code = v.sub), v.names::jsonb, v.terms, v.tags
from (values
 ('tteokbokki', 'tteokbokki', '{"ko":"떡볶이","en":"Tteokbokki","ja":"トッポッキ","zh-cn":"炒年糕"}', array['떡볶이','tteokbokki','トッポッキ','炒年糕'], '{}'::text[]),
 ('cheese-tteokbokki', 'tteokbokki', '{"ko":"치즈 떡볶이","en":"Cheese tteokbokki","ja":"チーズトッポッキ","zh-cn":"芝士炒年糕"}', array['치즈떡볶이','cheese tteokbokki','チーズトッポッキ','芝士炒年糕'], '{}'),
 ('fish-cake', 'fish_cake', '{"ko":"어묵","en":"Fish cake skewer","ja":"韓国おでん","zh-cn":"鱼饼串"}', array['어묵','오뎅','fish cake','eomuk','おでん','鱼饼'], '{seafood}'),
 ('twigim', 'fried', '{"ko":"모둠 튀김","en":"Assorted fried bites","ja":"天ぷら盛り合わせ","zh-cn":"什锦炸物"}', array['튀김','모둠튀김','twigim'], '{}'),
 ('fried-shrimp', 'fried', '{"ko":"새우튀김","en":"Fried shrimp","ja":"エビ天","zh-cn":"炸虾"}', array['새우튀김','fried shrimp','エビ天','炸虾'], '{seafood}'),
 ('sundae', 'sundae', '{"ko":"순대","en":"Sundae (blood sausage)","ja":"スンデ","zh-cn":"血肠"}', array['순대','sundae','スンデ','血肠'], '{}'),
 ('mandu', 'dumplings', '{"ko":"만두","en":"Dumplings","ja":"マンドゥ","zh-cn":"饺子"}', array['만두','mandu','dumplings','饺子'], '{}'),
 ('corn-dog', 'corn_dog', '{"ko":"핫도그","en":"Korean corn dog","ja":"ハットグ","zh-cn":"韩式热狗"}', array['핫도그','corn dog','ハットグ','热狗'], '{}'),
 ('chicken-skewer', 'chicken_skewer', '{"ko":"닭꼬치","en":"Chicken skewer","ja":"タッコチ（焼き鳥）","zh-cn":"鸡肉串"}', array['닭꼬치','chicken skewer','焼き鳥','鸡肉串'], '{}'),
 ('spicy-chicken-skewer', 'chicken_skewer', '{"ko":"매운 닭꼬치","en":"Spicy chicken skewer","ja":"辛い焼き鳥","zh-cn":"辣鸡肉串"}', array['매운닭꼬치','spicy chicken skewer'], '{}'),
 ('lamb-skewer', 'lamb_skewer', '{"ko":"양꼬치","en":"Lamb skewer","ja":"羊串","zh-cn":"羊肉串"}', array['양꼬치','lamb skewer','羊肉串'], '{}'),
 ('beef-steak-cubes', 'beef', '{"ko":"큐브 스테이크","en":"Steak cubes","ja":"キューブステーキ","zh-cn":"牛肉粒"}', array['큐브스테이크','소고기큐브','steak cubes','牛肉粒'], '{}'),
 ('grilled-lobster', 'grilled_seafood', '{"ko":"랍스터 구이","en":"Grilled lobster","ja":"ロブスター焼き","zh-cn":"烤龙虾"}', array['랍스터구이','랍스터','grilled lobster','lobster','烤龙虾'], '{seafood}'),
 ('grilled-scallop', 'grilled_seafood', '{"ko":"가리비 구이","en":"Grilled scallops","ja":"ホタテ焼き","zh-cn":"烤扇贝"}', array['가리비구이','가리비','grilled scallop','烤扇贝'], '{seafood}'),
 ('grilled-cheese', 'grilled_cheese', '{"ko":"구운 치즈","en":"Grilled cheese","ja":"焼きチーズ","zh-cn":"烤芝士"}', array['구운치즈','치즈구이','grilled cheese','烤芝士'], '{}'),
 ('sausage', 'sausage', '{"ko":"소시지","en":"Sausage","ja":"ソーセージ","zh-cn":"香肠"}', array['소시지','소세지','sausage','香肠'], '{}'),
 ('hotteok', 'hotteok', '{"ko":"호떡","en":"Hotteok","ja":"ホットク","zh-cn":"糖饼"}', array['호떡','hotteok','ホットク','糖饼'], '{}'),
 ('egg-bread', 'egg_bread', '{"ko":"계란빵","en":"Egg bread","ja":"ケランパン","zh-cn":"鸡蛋面包"}', array['계란빵','egg bread','ケランパン','鸡蛋面包'], '{}'),
 ('roasted-chestnuts', 'roasted', '{"ko":"군밤","en":"Roasted chestnuts","ja":"焼き栗","zh-cn":"烤栗子"}', array['군밤','roasted chestnuts','焼き栗','烤栗子'], '{}'),
 ('roasted-sweet-potato', 'roasted', '{"ko":"군고구마","en":"Roasted sweet potato","ja":"焼き芋","zh-cn":"烤红薯"}', array['군고구마','roasted sweet potato','焼き芋','烤红薯'], '{}'),
 ('ginkgo-nuts', 'roasted', '{"ko":"은행","en":"Roasted ginkgo nuts","ja":"銀杏","zh-cn":"烤银杏"}', array['은행','구운은행','ginkgo'], '{}'),
 ('jwipo', 'dried_seafood', '{"ko":"쥐포","en":"Grilled filefish jerky","ja":"カワハギの干物","zh-cn":"烤鱼片"}', array['쥐포','jwipo'], '{seafood}'),
 ('dried-squid', 'dried_seafood', '{"ko":"오징어 구이","en":"Grilled dried squid","ja":"焼きイカ","zh-cn":"烤鱿鱼"}', array['오징어','오징어구이','dried squid','焼きイカ','烤鱿鱼'], '{seafood}'),
 ('tornado-potato', 'tornado_potato', '{"ko":"회오리감자","en":"Tornado potato","ja":"トルネードポテト","zh-cn":"旋风土豆"}', array['회오리감자','tornado potato','トルネードポテト','旋风土豆'], '{}'),
 ('bungeoppang', 'fish_bread', '{"ko":"붕어빵","en":"Fish-shaped bread","ja":"たい焼き","zh-cn":"鲷鱼烧"}', array['붕어빵','bungeoppang','たい焼き','鲷鱼烧'], '{}'),
 ('corn', 'corn', '{"ko":"옥수수","en":"Corn on the cob","ja":"とうもろこし","zh-cn":"玉米"}', array['옥수수','corn','とうもろこし','玉米'], '{}'),
 ('fresh-juice', 'fresh_juice', '{"ko":"생과일주스","en":"Fresh fruit juice","ja":"生フルーツジュース","zh-cn":"鲜榨果汁"}', array['생과일주스','과일주스','fresh juice','鲜榨果汁'], '{}'),
 ('strawberry-mochi', 'mochi', '{"ko":"딸기모찌","en":"Strawberry mochi","ja":"いちご大福","zh-cn":"草莓麻薯"}', array['딸기모찌','strawberry mochi','いちご大福','草莓麻薯','草莓大福'], '{}'),
 ('chocolate-mochi', 'mochi', '{"ko":"초코모찌","en":"Chocolate mochi","ja":"チョコ大福","zh-cn":"巧克力麻薯"}', array['초코모찌','chocolate mochi','チョコ大福','巧克力麻薯'], '{}'),
 ('green-tea-mochi', 'mochi', '{"ko":"녹차모찌","en":"Green tea mochi","ja":"抹茶大福","zh-cn":"抹茶麻薯"}', array['녹차모찌','green tea mochi','抹茶大福','抹茶麻薯'], '{}'),
 ('tanghulu', 'tanghulu', '{"ko":"탕후루","en":"Tanghulu","ja":"タンフル","zh-cn":"糖葫芦"}', array['탕후루','tanghulu','タンフル','糖葫芦'], '{}'),
 ('fruit-cup', 'fruit_cup', '{"ko":"과일컵","en":"Fruit cup","ja":"フルーツカップ","zh-cn":"水果杯"}', array['과일컵','fruit cup','フルーツカップ','水果杯'], '{}'),
 ('soft-ice-cream', 'ice_cream', '{"ko":"소프트 아이스크림","en":"Soft-serve ice cream","ja":"ソフトクリーム","zh-cn":"软冰淇淋"}', array['소프트아이스크림','아이스크림','soft serve','ソフトクリーム','冰淇淋'], '{}'),
 ('socks', 'socks', '{"ko":"양말","en":"Socks","ja":"靴下","zh-cn":"袜子"}', array['양말','socks','靴下','袜子'], '{}'),
 ('hats', 'hats', '{"ko":"모자","en":"Hats","ja":"帽子","zh-cn":"帽子"}', array['모자','hat','hats','帽子'], '{}'),
 ('phone-cases', 'phone_accessories', '{"ko":"휴대폰 케이스","en":"Phone cases","ja":"スマホケース","zh-cn":"手机壳"}', array['휴대폰케이스','폰케이스','phone case','スマホケース','手机壳'], '{}')
) v(code, sub, names, terms, tags);

insert into public.landmarks (area_id, code, name_i18n, short_i18n, lat, lng, kind, priority)
select a.id, v.code, v.n::jsonb, v.s::jsonb, v.lat, v.lng, v.kind, v.pr
from public.areas a, (values
 ('myeongdong-station', '{"ko":"명동역 (4호선)","en":"Myeongdong Stn. (Line 4)","ja":"明洞駅（4号線）","zh-cn":"明洞站（4号线）"}',
                        '{"ko":"명동역","en":"Myeongdong Stn.","ja":"明洞駅","zh-cn":"明洞站"}', 37.56089, 126.98642, 'station', 1),
 ('myeongdong-exit-6', '{"ko":"명동역 6번 출구","en":"Myeongdong Stn. Exit 6","ja":"明洞駅6番出口","zh-cn":"明洞站6号出口"}',
                       '{"ko":"명동역 6번 출구","en":"Exit 6","ja":"明洞駅6番出口","zh-cn":"明洞站6号出口"}', 37.56118, 126.98540, 'exit', 3),
 ('myeongdong-exit-8', '{"ko":"명동역 8번 출구","en":"Myeongdong Stn. Exit 8","ja":"明洞駅8番出口","zh-cn":"明洞站8号出口"}',
                       '{"ko":"명동역 8번 출구","en":"Exit 8","ja":"明洞駅8番出口","zh-cn":"明洞站8号出口"}', 37.56110, 126.98700, 'exit', 3),
 ('uniqlo-myeongdong', '{"ko":"유니클로 명동점","en":"UNIQLO Myeongdong","ja":"ユニクロ明洞店","zh-cn":"优衣库明洞店"}',
                       '{"ko":"유니클로","en":"UNIQLO","ja":"ユニクロ","zh-cn":"优衣库"}', 37.56360, 126.98430, 'building', 1),
 ('lotte-main', '{"ko":"롯데백화점 본점","en":"Lotte Dept. Store","ja":"ロッテ百貨店本店","zh-cn":"乐天百货总店"}',
                '{"ko":"롯데백화점","en":"Lotte Dept. Store","ja":"ロッテ百貨店","zh-cn":"乐天百货"}', 37.56480, 126.98140, 'building', 1),
 ('arts-theater', '{"ko":"명동예술극장","en":"Myeongdong Theater","ja":"明洞芸術劇場","zh-cn":"明洞艺术剧场"}',
                  '{"ko":"명동예술극장","en":"Myeongdong Theater","ja":"明洞芸術劇場","zh-cn":"明洞艺术剧场"}', 37.56405, 126.98340, 'building', 2),
 ('zara-myeongdong', '{"ko":"ZARA 명동점","en":"ZARA Myeongdong","ja":"ZARA明洞店","zh-cn":"ZARA明洞店"}',
                     '{"ko":"ZARA","en":"ZARA","ja":"ZARA","zh-cn":"ZARA"}', 37.56290, 126.98620, 'building', 3),
 ('myeongdong-cathedral', '{"ko":"명동성당","en":"Myeongdong Cathedral","ja":"明洞聖堂","zh-cn":"明洞天主教堂"}',
                          '{"ko":"명동성당","en":"Myeongdong Cathedral","ja":"明洞聖堂","zh-cn":"明洞天主教堂"}', 37.56330, 126.98710, 'building', 2),
 ('euljiro1ga-station', '{"ko":"을지로입구역","en":"Euljiro 1-ga Stn.","ja":"乙支路入口駅","zh-cn":"乙支路入口站"}',
                        '{"ko":"을지로입구역","en":"Euljiro 1-ga Stn.","ja":"乙支路入口駅","zh-cn":"乙支路入口站"}', 37.56600, 126.98230, 'station', 2)
) v(code, n, s, lat, lng, kind, pr) where a.code = 'myeongdong';

insert into public.patrol_routes (area_id, name) select id, 'Main patrol' from public.areas where code = 'myeongdong';

-- ───────────── final grant pass (authoritative) ─────────────
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
-- future private helpers must not become callable by API roles by default
alter default privileges in schema private revoke execute on functions from public;

-- RLS policies call these two helpers as the caller, so the caller needs them.
grant usage on schema private to authenticated;
grant execute on function private.is_staff(), private.current_admin_role() to authenticated;

grant execute on function
  public.field_status(), public.field_map(), public.field_nearby_spots(double precision, double precision, double precision),
  public.field_route(uuid), public.field_create_spot(jsonb), public.field_record_observation(jsonb),
  public.field_apply_change(jsonb), public.admin_get_stall(uuid), public.admin_update_stall(jsonb),
  public.admin_route_move(uuid, uuid, integer), public.admin_route_insert(uuid, uuid, uuid), public.admin_route_remove(uuid, uuid),
  public.admin_set_spot_status(uuid, public.spot_status), public.admin_merge_spots(uuid, uuid),
  public.admin_save_display_line(uuid, text, jsonb), public.admin_delete_display_line(uuid), public.admin_whoami()
to authenticated;

-- Public RPCs: callable with the anon key but useless without the server secret.
grant execute on function
  public.public_reference(text), public.public_map_stalls(text, double precision, double precision, double precision, double precision),
  public.public_stall(text, text, text), public.public_rankings(text), public.public_search(text, text), public.public_food(text, text),
  public.public_sitemap(text), public.public_nearby_stalls(text, double precision, double precision),
  public.public_spice_vote(text, text, uuid, smallint), public.public_photo_vote(text, text, uuid, smallint),
  public.public_submit_review(text, text, jsonb), public.public_submit_report(text, text, jsonb),
  public.public_cache_review_translation(text, uuid, text, text, text)
to anon, authenticated;
