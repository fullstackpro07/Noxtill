-- Pricing page alignment (docs: pricing.pdf change spec, 2026-11-12).
-- Idempotent and safe to re-run. Run once per environment (local, staging, production).
--
--   npx prisma db execute --file prisma/ops/2026-11-13-pricing-page-alignment.sql --schema prisma/schema.prisma
--
-- Seeds never overwrite rows operators have changed, so existing databases keep the old values
-- until this runs. Prices are versioned by effective_from (latest wins), so history is kept:
-- new rows are INSERTED, nothing is overwritten. Credits are only changed if still the old seed.

-- C10: Business AI credits stay at 8,000. The heavy intelligence features (BI diagnosis,
-- Business Simulator, Competitive Insights recommendations) use a separate monthly
-- "intelligence_runs" allowance instead (150 on Business); its rows are inserted by the seed at boot.

-- C9: extra emails $1 -> $1.50 per 1,000.
INSERT INTO meter_prices (id, metric_code, country_code, number_type, unit_price_usd, per, currency, effective_from)
SELECT UUID(), 'emails', '', '', 1.5, 1000, 'USD', NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT unit_price_usd FROM meter_prices
    WHERE metric_code = 'emails' AND country_code = '' AND number_type = ''
    ORDER BY effective_from DESC LIMIT 1
  ) latest WHERE latest.unit_price_usd = 1.5
);

-- C3: phone number floor $4 local / $7 toll-free.
INSERT INTO meter_prices (id, metric_code, country_code, number_type, unit_price_usd, per, currency, effective_from)
SELECT UUID(), 'phone_numbers_local', '', 'local', 4, 1, 'USD', NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT unit_price_usd FROM meter_prices
    WHERE metric_code = 'phone_numbers_local' AND country_code = '' AND number_type = 'local'
    ORDER BY effective_from DESC LIMIT 1
  ) latest WHERE latest.unit_price_usd = 4
);

INSERT INTO meter_prices (id, metric_code, country_code, number_type, unit_price_usd, per, currency, effective_from)
SELECT UUID(), 'phone_numbers_tollfree', '', 'tollfree', 7, 1, 'USD', NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT unit_price_usd FROM meter_prices
    WHERE metric_code = 'phone_numbers_tollfree' AND country_code = '' AND number_type = 'tollfree'
    ORDER BY effective_from DESC LIMIT 1
  ) latest WHERE latest.unit_price_usd = 7
);

-- C6: video meeting minutes are now a monthly allowance (was a counted-only pass-through).
-- The per-plan minute and participant rows are inserted automatically by the seed at boot.
UPDATE meter_definitions SET kind = 'allowance'
WHERE metric_code = 'video_minutes' AND kind = 'passthrough';

-- C7 / C15: storage and AI Photo Digitizer allowances per plan. These rows already exist as
-- "not configured" (NULL) on older databases; only NULL rows are filled, so an operator's own
-- value is never overwritten. New metrics (retention days, concurrent calls, API requests,
-- website bandwidth, video and recording minutes, intelligence runs) are inserted by the seed at boot.
UPDATE plan_entitlements pe JOIN plans p ON p.id = pe.plan_id
SET pe.included_quantity = CASE p.`key`
  WHEN 'trial' THEN 10737418240 WHEN 'starter' THEN 10737418240
  WHEN 'growth' THEN 53687091200 WHEN 'professional' THEN 214748364800
  WHEN 'business' THEN 536870912000 END
WHERE pe.metric_code = 'storage_bytes' AND pe.included_quantity IS NULL
  AND p.`key` IN ('trial','starter','growth','professional','business');

UPDATE plan_entitlements pe JOIN plans p ON p.id = pe.plan_id
SET pe.included_quantity = CASE p.`key`
  WHEN 'trial' THEN 50 WHEN 'starter' THEN 50 WHEN 'growth' THEN 200
  WHEN 'professional' THEN 1000 WHEN 'business' THEN 3000 END
WHERE pe.metric_code = 'digitizer_pages' AND pe.included_quantity IS NULL
  AND p.`key` IN ('trial','starter','growth','professional','business');

-- Extra storage ($5 per 100 GB), video minutes ($10 per 1,000) and recording hours ($5 per 10 h).
INSERT INTO meter_prices (id, metric_code, country_code, number_type, unit_price_usd, per, currency, effective_from)
SELECT UUID(), m.metric_code, '', '', m.price, m.per, 'USD', NOW(3)
FROM (SELECT 'storage_bytes' AS metric_code, 5 AS price, 1 AS per
      UNION ALL SELECT 'video_minutes', 10, 1000
      UNION ALL SELECT 'video_recording_minutes', 5, 600) m
WHERE NOT EXISTS (SELECT 1 FROM meter_prices mp WHERE mp.metric_code = m.metric_code AND mp.country_code = '');
