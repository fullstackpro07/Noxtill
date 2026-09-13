-- Staff depth fix (UPD-INT-011): overtime hours were computed correctly but never priced into
-- pay anywhere — this adds a real, opt-in hourly wage per staff member and a per-business
-- overtime multiplier so PayrollService can actually turn overtime hours into real pay.
ALTER TABLE `business_users`
  ADD COLUMN `hourly_rate` DECIMAL(10, 2) NULL;

ALTER TABLE `businesses`
  ADD COLUMN `overtime_rate_multiplier` DECIMAL(3, 2) NOT NULL DEFAULT 1.5;
