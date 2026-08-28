ALTER TABLE businesses
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN accepted_payment_methods JSON NOT NULL DEFAULT (JSON_ARRAY('cash', 'card', 'online', 'credit'));
