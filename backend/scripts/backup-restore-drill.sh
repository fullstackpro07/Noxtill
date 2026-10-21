#!/usr/bin/env bash
# Backup + restore drill (spec §6 / BE-090). Proves a real mysqldump of a live database can be
# restored into a fresh database with no data loss — not just that the commands exit 0, but that
# a specific, known row genuinely round-trips. Run in CI (ci.yml) against the MySQL service
# container; needs real mysqldump/mysql on PATH, which this dev machine's shell doesn't have, so
# this script is written correctly and reviewed, not locally dry-run here.
#
# MySQL migration note: this replaces the original Postgres version (pg_dump/pg_restore/psql,
# gen_random_uuid()) — see git history for the pre-migration script if needed for reference.
set -euo pipefail

: "${MYSQL_HOST:?MYSQL_HOST is required}"
: "${MYSQL_PORT:?MYSQL_PORT is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
export MYSQL_PWD="${MYSQL_PASSWORD:-}"

# `--protocol=TCP` is required: `mysql -h localhost` prefers the Unix socket, which does not
# exist on the GitHub Actions runner (the MySQL service is a container published on TCP 3306).
MYSQL=(mysql --protocol=TCP -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER")
RESTORE_DB="${MYSQL_DATABASE}_restore_drill"
DUMP_FILE="$(mktemp -t noxtill-backup-drill-XXXXXX).sql"
CANARY_SLUG="backup-drill-canary-$(date +%s)"

cleanup() {
  "${MYSQL[@]}" -D "$MYSQL_DATABASE" -e "DELETE FROM businesses WHERE slug = '${CANARY_SLUG}';" >/dev/null 2>&1 || true
  "${MYSQL[@]}" -e "DROP DATABASE IF EXISTS \`${RESTORE_DB}\`;" >/dev/null 2>&1 || true
  rm -f "$DUMP_FILE"
}
trap cleanup EXIT

echo "==> Inserting a canary row into '${MYSQL_DATABASE}.businesses' (slug=${CANARY_SLUG})"
# Prisma's @default on a Json column is applied by the client, not the database, so every required
# column without a database default must be given here. They are read from the live schema rather than
# listed by hand: a hard-coded list broke once already when a migration added `enabled_modules`.
REQUIRED=$("${MYSQL[@]}" -N -e "
  SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = '${MYSQL_DATABASE}' AND TABLE_NAME = 'businesses'
    AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL
    AND COLUMN_NAME NOT IN ('id', 'name', 'slug', 'created_at', 'updated_at')
  ORDER BY ORDINAL_POSITION;")
COLS="id, name, slug, created_at, updated_at"
VALS="UUID(), 'Backup Drill Canary', '${CANARY_SLUG}', NOW(3), NOW(3)"
while read -r col type; do
  [ -z "$col" ] && continue
  case "$type" in
    json) v="CAST('{}' AS JSON)" ;;
    varchar|char|text|mediumtext|longtext) v="''" ;;
    int|bigint|smallint|tinyint|decimal|double|float) v="0" ;;
    datetime|timestamp) v="NOW(3)" ;;
    *) echo "FAIL: businesses.${col} (${type}) is required with no default; the drill doesn't know a value for it"; exit 1 ;;
  esac
  COLS="${COLS}, \`${col}\`"
  VALS="${VALS}, ${v}"
done <<<"$REQUIRED"
"${MYSQL[@]}" -D "$MYSQL_DATABASE" -e "INSERT INTO businesses (${COLS}) VALUES (${VALS});"

echo "==> mysqldump ${MYSQL_DATABASE} -> ${DUMP_FILE}"
mysqldump --protocol=TCP -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" --single-transaction --routines "$MYSQL_DATABASE" >"$DUMP_FILE"

echo "==> Creating a fresh database for the restore drill: ${RESTORE_DB}"
"${MYSQL[@]}" -e "DROP DATABASE IF EXISTS \`${RESTORE_DB}\`;"
"${MYSQL[@]}" -e "CREATE DATABASE \`${RESTORE_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

echo "==> Restoring dump into ${RESTORE_DB}"
"${MYSQL[@]}" -D "$RESTORE_DB" <"$DUMP_FILE"

echo "==> Verifying the canary row survived the restore"
FOUND=$("${MYSQL[@]}" -D "$RESTORE_DB" -N -e "SELECT COUNT(*) FROM businesses WHERE slug = '${CANARY_SLUG}';")

if [ "$FOUND" != "1" ]; then
  echo "FAIL: canary row not found after restore (expected 1, got ${FOUND})"
  exit 1
fi

echo "==> Backup + restore drill passed: canary row verified present after a real dump/restore round-trip."
