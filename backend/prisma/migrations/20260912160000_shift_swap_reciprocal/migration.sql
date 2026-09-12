-- Staff depth fix (UPD-INT-011): a shift swap request can now name a specific shift already
-- belonging to the covering staff member, which gets traded back on approval — a real reciprocal
-- swap instead of a one-way handoff. Plain reference (no FK), same convention as
-- `swap_covering_user_id`.
ALTER TABLE `staff_shifts`
  ADD COLUMN `swap_with_shift_id` VARCHAR(191) NULL AFTER `swap_reviewed_by_user_id`;
