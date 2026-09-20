-- Staff module v2 — deactivate/reactivate is now a real, reversible flag instead of a hard
-- delete, so attendance/commission/order/shift history for a deactivated staff member is
-- never lost or FK-orphaned.
ALTER TABLE `business_users` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true;
