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
