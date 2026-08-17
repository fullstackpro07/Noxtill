-- MySQL migration: reporting views (not modeled in schema.prisma — Prisma has no view support).
-- Rewritten from the original Postgres versions (see prisma/migrations-postgres-archive/
-- 20260718075532_init_be_m0/migration.sql) for MySQL syntax: DATE() replaces the Postgres cast,
-- DATEDIFF(NOW(), ...) replaces EXTRACT(DAY FROM now() - ...)::int. The original's
-- `REVOKE ... FROM PUBLIC` lines are intentionally dropped (Postgres-only privilege model, was
-- already a no-op in local dev per the original migration's own comment).

CREATE VIEW v_daily_close AS
SELECT
  o.business_id AS business_id,
  DATE(o.created_at) AS close_date,
  COUNT(*) AS orders_count,
  SUM(o.total) AS revenue,
  SUM(o.cogs) AS cogs,
  SUM(o.total - o.cogs) AS gross_profit
FROM orders o
WHERE o.status = 'completed'
GROUP BY o.business_id, DATE(o.created_at);

CREATE VIEW v_credit_balances AS
SELECT
  ce.business_id AS business_id,
  ce.customer_id AS customer_id,
  SUM(CASE WHEN ce.kind = 'credit' THEN ce.amount ELSE -ce.amount END) AS balance,
  MAX(ce.created_at) AS last_entry_at,
  DATEDIFF(NOW(), MAX(ce.created_at)) AS days_outstanding
FROM credit_entries ce
GROUP BY ce.business_id, ce.customer_id;
