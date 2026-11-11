#!/usr/bin/env bash
# Local Postgres for development/testing without a Supabase project.
# Applies supabase/local-shim.sql (auth schema + roles that Supabase provides)
# and then every migration in order. NEVER used in production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDATA="${LOCAL_PGDATA:-/tmp/msm-pgdata}"
PGPORT="${LOCAL_PGPORT:-54329}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u postgres --"; fi
psqlc() { $RUN_AS "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h /tmp -p "$PGPORT" -U postgres "$@"; }

start() {
  if [ ! -d "$PGDATA" ]; then
    mkdir -p "$PGDATA"; [ -n "$RUN_AS" ] && chown postgres "$PGDATA"
    $RUN_AS "$PGBIN/initdb" -D "$PGDATA" -U postgres -A trust >/dev/null
  fi
  if ! $RUN_AS "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    $RUN_AS "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k /tmp -c listen_addresses=localhost" -l "$PGDATA/log" start >/dev/null
    sleep 1
  fi
}

reset() {
  start
  psqlc -d postgres -c "drop database if exists msm with (force)" -c "create database msm"
  psqlc -d msm -f "$ROOT/supabase/local-shim.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do psqlc -d msm -f "$f"; done
  # --no-seed: schema only (SQL tests) · --empty: dev admin, no stalls (field E2E) · default: dev admin + demo stalls
  if [ "${1:-}" != "--no-seed" ]; then psqlc -d msm -f "$ROOT/supabase/seed.sql"; fi
  if [ -z "${1:-}" ]; then psqlc -d msm -f "$ROOT/supabase/seed-demo.sql"; fi
  echo "local db ready: postgres://postgres@localhost:$PGPORT/msm"
}

case "${1:-reset}" in
  start) start ;;
  reset) reset "${2:-}" ;;
  test)
    reset --no-seed
    for f in "$ROOT"/supabase/tests/*.sql; do echo "== $f"; psqlc -d msm -o /dev/null -f "$f"; done
    for f in "$ROOT"/supabase/tests/*.sh; do [ -f "$f" ] && echo "== $f" && PGPORT="$PGPORT" bash "$f"; done
    echo "ALL SQL TESTS PASSED" ;;
  psql) shift; psqlc -d msm "$@" ;;
esac
