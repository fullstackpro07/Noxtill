ALTER TABLE `phone_calls`
  ADD COLUMN `booking_attempts` JSON NOT NULL DEFAULT (JSON_ARRAY());
