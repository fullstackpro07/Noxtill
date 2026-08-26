ALTER TABLE businesses
  ADD COLUMN break_threshold_hours INT NOT NULL DEFAULT 6,
  ADD COLUMN break_minutes_per_shift INT NOT NULL DEFAULT 30;
