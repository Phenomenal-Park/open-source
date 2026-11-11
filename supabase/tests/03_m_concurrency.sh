#!/usr/bin/env bash
# Two simultaneous sessions saving spots must never receive the same M number (§73).
set -euo pipefail
RUN_AS=""; [ "$(id -u)" = "0" ] && RUN_AS="runuser -u postgres --"
P="$RUN_AS /usr/lib/postgresql/16/bin/psql -X -q -t -A -v ON_ERROR_STOP=1 -h /tmp -p ${PGPORT:-54329} -U postgres -d msm"
run() {
  for i in $(seq 1 25); do
    $P <<SQL | grep -E '^[0-9]+$'
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000f"}',true) is null;
select public.field_create_spot('{"lat":37.5630$1,"lng":126.9850,"category_code":"snack"}')->>'m_number';
commit;
SQL
  done
}
run 1 > /tmp/msm_a.txt & run 2 > /tmp/msm_b.txt & wait
total=$(cat /tmp/msm_a.txt /tmp/msm_b.txt | grep -c .)
uniq=$(cat /tmp/msm_a.txt /tmp/msm_b.txt | grep . | sort -u | wc -l)
[ "$total" = "50" ] && [ "$uniq" = "50" ] || { echo "FAIL total=$total unique=$uniq"; exit 1; }
gaps=$($P -c "select count(*) from generate_series((select min(m_number) from spots), (select max(m_number) from spots)) g where g not in (select m_number from spots)")
[ "$gaps" = "0" ] || { echo "FAIL gaps=$gaps"; exit 1; }
echo "concurrency test passed (50 concurrent saves, 50 unique, gapless M numbers)"
