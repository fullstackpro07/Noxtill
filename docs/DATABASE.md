# Database

This project runs on **MySQL** (8.0+), not PostgreSQL. It was originally built on Postgres and
migrated in one pass — see `prisma/migrations-postgres-archive/` for the old migration history if
you ever need to see what the original Postgres-flavored DDL looked like. The migration was
required because the production hosting environment only supports MySQL.

`prisma/schema.prisma`'s `datasource db { provider = "mysql" }` is the source of truth; everything
below is context that doesn't show up just from reading the schema.

## Local setup

1. Install MySQL 8.0+ (native service, matching how this project runs — no Docker in this repo).
2. Create the database and an app user:
   ```sql
   CREATE DATABASE Noxtill CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'noxtill'@'localhost' IDENTIFIED BY '<password>';
   GRANT ALL PRIVILEGES ON *.* TO 'noxtill'@'localhost'; -- broad grant: Prisma Migrate needs
                                                          -- shadow-database create/drop rights
                                                          -- for `prisma migrate dev`
   FLUSH PRIVILEGES;
   ```
3. Lower the FULLTEXT minimum token length (default 4 chars silently drops short product
   codes/names from search) — in `my.ini`:
   ```
   [mysqld]
   innodb_ft_min_token_size=2
   ```
   then restart MySQL and rebuild any existing FULLTEXT indexes.
4. Set `DATABASE_URL="mysql://noxtill:<password>@localhost:3306/Noxtill"` in `backend/.env`.

## FULLTEXT search convention

There is no MySQL equivalent to Postgres's `pg_trgm`/`similarity()` (fuzzy, typo-tolerant
matching), so cross-entity search (`search/search.service.ts`) and the RAG help-doc retrieval
(`help/help.service.ts`) run on MySQL's native `FULLTEXT` indexes (`@@fulltext` in
`schema.prisma`) with `MATCH() AGAINST(... IN BOOLEAN MODE)`. The shared query-builder is
`common/utils/mysql-fulltext.util.ts`'s `buildFulltextBooleanQuery()` — it strips boolean-mode
operator characters out of raw user input, then requires every remaining word with a trailing `*`
wildcard for prefix/search-as-you-type matching. Use this helper for any new full-text query
rather than hand-rolling `AGAINST` strings.

**Disclosed trade-off**: boolean mode is not typo-tolerant the way trigram similarity was, and
(per `innodb_ft_min_token_size`) ignores tokens shorter than the configured minimum. This was a
deliberate choice over falling back to plain `LIKE` matching — real relevance ranking, no new
external dependency.

## The `SlotLock` row-lock pattern

Postgres's `pg_advisory_xact_lock`/`hashtext` (used by `bookings/booking-lock.util.ts` to
serialize concurrent slot bookings) has no MySQL equivalent — MySQL's `GET_LOCK()` is
session-scoped, not transaction-scoped, and would leak locks on a crash mid-transaction. The
`SlotLock` model (`schema.prisma`) is the real MySQL-native equivalent: a caller upserts a row
(`INSERT ... ON DUPLICATE KEY UPDATE`) then `SELECT ... FOR UPDATE`s it inside its own
`$transaction` — InnoDB holds that row lock until COMMIT/ROLLBACK, giving the same
transaction-scoped mutex semantics. Reuse this pattern (a dedicated lock-key table + upsert +
`FOR UPDATE`) for any future need to serialize concurrent writes around a value that doesn't
otherwise have a real row to lock.

## Postgres-only SQL to avoid in any future raw query

The whole codebase was audited and fixed for these once; don't reintroduce them:

| Don't use (Postgres-only) | Use instead (MySQL) |
|---|---|
| `col ILIKE '%x%'` | `col LIKE '%x%'` (MySQL is case-insensitive by default under an `_ci` collation) |
| `col::date`, `col::int` | `DATE(col)`, `CAST(col AS SIGNED)` |
| `to_char(col, 'YYYY-MM')` | `DATE_FORMAT(col, '%Y-%m')` |
| `date_trunc('month', col)` | `DATE_FORMAT(col, '%Y-%m-01')` |
| `date_trunc('week', col)` | `DATE_SUB(DATE(col), INTERVAL WEEKDAY(col) DAY)` |
| `now() - interval 'N days'` | `DATE_SUB(NOW(), INTERVAL N DAY)` |
| `EXTRACT(HOUR FROM col)` | `HOUR(col)` |
| `EXTRACT(DOW FROM col)` (0=Sun..6=Sat) | `DAYOFWEEK(col) - 1` (MySQL's `DAYOFWEEK` is 1=Sun..7=Sat) |
| `COUNT(*) FILTER (WHERE cond)` | `SUM(CASE WHEN cond THEN 1 ELSE 0 END)` |
| `pg_advisory_xact_lock(...)` | The `SlotLock` pattern above |
| `similarity(col, x) > threshold` | `MATCH(col) AGAINST(x IN BOOLEAN MODE)` (see FULLTEXT convention above) |
| Prisma's `mode: 'insensitive'` filter option | Drop it — MySQL's `_ci` collation already makes `contains`/`equals` case-insensitive |
| A Prisma `String[]`/`Int[]` scalar-list column | `Json` (MySQL's connector has no native array column type) — read/write the JS array wholesale, use the Json filter API's `array_contains` instead of the array API's `has`/`hasSome` |
| Reserved words as bare column aliases (e.g. `AS read`) | Quote with backticks or just rename the alias (MySQL reserves `read`/`order`/`group`/etc.) |

Also: any `String @unique`/`@@unique`/`@@id` field holding potentially long content should get
`@db.Text` if it's genuinely free text (Prisma's MySQL default for `String` is `VARCHAR(191)`,
which silently truncates/rejects longer values — Postgres's plain `TEXT`/unbounded `varchar` never
had this limit, so this is an easy thing to forget when porting a new Postgres-authored model).
