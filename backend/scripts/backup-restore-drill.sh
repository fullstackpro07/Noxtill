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
"${MYSQL[@]}" -D "$MYSQL_DATABASE" -e \
  "INSERT INTO businesses (id, name, slug, branding, dashboard_config, working_hours, referral_settings, health_score_weights, created_at, updated_at) VALUES (UUID(), 'Backup Drill Canary', '${CANARY_SLUG}', CAST('{}' AS JSON), CAST('{}' AS JSON), CAST('{}' AS JSON), CAST('{}' AS JSON), CAST('{}' AS JSON), NOW(), NOW());"

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
