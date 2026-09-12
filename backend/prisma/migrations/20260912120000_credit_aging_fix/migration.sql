-- Credit depth fix (UPD-INT-006) — `v_credit_balances.days_outstanding` previously measured days
-- since the customer's MOST RECENT ledger activity of any kind (DATEDIFF(NOW(), MAX(created_at))),
-- so any partial payment toward an old debt reset the age to ~0, hiding genuinely 90+-day-overdue
-- balances from Overdue/Outstanding buckets, at-risk detection, and credit reminder-rule
-- escalation. Redefines it as the real age of the current unpaid balance: days since the most
-- recent time this customer's running balance was fully settled (<= 0), or since their very first
-- credit entry if it has never been settled. A full payoff still correctly resets the age; a
-- partial payment no longer does.

CREATE OR REPLACE VIEW v_credit_balances AS
WITH running AS (
  SELECT
    ce.business_id,
    ce.customer_id,
    ce.created_at,
    SUM(CASE WHEN ce.kind = 'credit' THEN ce.amount ELSE -ce.amount END)
      OVER (PARTITION BY ce.business_id, ce.customer_id ORDER BY ce.created_at, ce.id) AS running_balance
  FROM credit_entries ce
),
last_zero AS (
  SELECT business_id, customer_id, MAX(created_at) AS last_zero_at
  FROM running
  WHERE running_balance <= 0
  GROUP BY business_id, customer_id
),
age_start AS (
  SELECT r.business_id, r.customer_id, MIN(r.created_at) AS age_start_at
  FROM running r
  LEFT JOIN last_zero lz
    ON lz.business_id = r.business_id AND lz.customer_id = r.customer_id
  WHERE r.created_at > COALESCE(lz.last_zero_at, '1970-01-01 00:00:00')
  GROUP BY r.business_id, r.customer_id
),
totals AS (
  SELECT
    business_id,
    customer_id,
    SUM(CASE WHEN kind = 'credit' THEN amount ELSE -amount END) AS balance,
    MAX(created_at) AS last_entry_at
  FROM credit_entries
  GROUP BY business_id, customer_id
)
SELECT
  t.business_id AS business_id,
  t.customer_id AS customer_id,
  t.balance AS balance,
  t.last_entry_at AS last_entry_at,
  DATEDIFF(NOW(), COALESCE(a.age_start_at, t.last_entry_at)) AS days_outstanding
FROM totals t
LEFT JOIN age_start a
  ON a.business_id = t.business_id AND a.customer_id = t.customer_id;
