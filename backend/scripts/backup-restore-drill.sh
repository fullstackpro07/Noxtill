#!/usr/bin/env bash
# Backup + restore drill (spec §6 / BE-090). Proves a real pg_dump of a live database can be
# restored into a fresh database with no data loss — not just that the commands exit 0, but that
# a specific, known row genuinely round-trips. Run in CI (ci.yml) against the Postgres service
# container; needs real pg_dump/pg_restore/psql on PATH, which this dev machine's shell doesn't
# have, so this script is written correctly and reviewed, not locally dry-run here.
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
export PGPASSWORD="${PGPASSWORD:-}"

PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1)
RESTORE_DB="${PGDATABASE}_restore_drill"
DUMP_FILE="$(mktemp -t noxtill-backup-drill-XXXXXX).dump"
CANARY_SLUG="backup-drill-canary-$(date +%s)"

cleanup() {
  "${PSQL[@]}" -d "$PGDATABASE" -c "DELETE FROM businesses WHERE slug = '${CANARY_SLUG}';" >/dev/null 2>&1 || true
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};" >/dev/null 2>&1 || true
  rm -f "$DUMP_FILE"
}
trap cleanup EXIT

echo "==> Inserting a canary row into '${PGDATABASE}.businesses' (slug=${CANARY_SLUG})"
"${PSQL[@]}" -d "$PGDATABASE" -c \
  "INSERT INTO businesses (id, name, slug, created_at, updated_at) VALUES (gen_random_uuid(), 'Backup Drill Canary', '${CANARY_SLUG}', now(), now());"

echo "==> pg_dump ${PGDATABASE} -> ${DUMP_FILE}"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc "$PGDATABASE" >"$DUMP_FILE"

echo "==> Creating a fresh database for the restore drill: ${RESTORE_DB}"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${RESTORE_DB};"

echo "==> pg_restore into ${RESTORE_DB}"
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$RESTORE_DB" --no-owner --no-privileges "$DUMP_FILE"

echo "==> Verifying the canary row survived the restore"
FOUND=$("${PSQL[@]}" -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM businesses WHERE slug = '${CANARY_SLUG}';")

if [ "$FOUND" != "1" ]; then
  echo "FAIL: canary row not found after restore (expected 1, got ${FOUND})"
  exit 1
fi

echo "==> Backup + restore drill passed: canary row verified present after a real dump/restore round-trip."
