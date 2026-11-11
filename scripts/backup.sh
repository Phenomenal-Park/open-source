#!/usr/bin/env bash
# Logical backup of the production database (see docs/SECURITY.md → Backups).
# Usage: DATABASE_URL=postgres://… OUT_DIR=/secure/backups bash scripts/backup.sh
# Run from a trusted machine/CI with DATABASE_URL injected from a secret store. Never commit dumps.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${OUT_DIR:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/msm-$STAMP.dump"
# public + private schemas: all operational data, functions and policies. auth is managed by Supabase.
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public --schema=private --file "$FILE"
pg_restore --list "$FILE" > /dev/null   # verify the archive is readable
sha256sum "$FILE" > "$FILE.sha256"
echo "backup written: $FILE"
# Retention (example): find "$OUT_DIR" -name 'msm-*.dump*' -mtime +30 -print   # review, then remove manually
