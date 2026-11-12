-- Operator request 2026-11-12: clearer, more vivid category colours (spec §15 allows tuning).
update public.categories set color = v.c, color_dark = v.d
from (values ('fried_bunsik', '#EF3B3B', '#E2585A'), ('skewer_grill', '#FF9500', '#F0A040'), ('snack', '#14B8A6', '#2BB3A3'),
             ('dessert_fruit', '#EE5DB5', '#E06BB5'), ('fashion_goods', '#7B61FF', '#8A76F0')) v(code, c, d)
where categories.code = v.code;
