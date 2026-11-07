ALTER TABLE `orders`
  ADD COLUMN `public_idempotency_key_hash` CHAR(64) NULL,
  ADD COLUMN `public_idempotency_request_hash` CHAR(64) NULL;

CREATE UNIQUE INDEX `orders_business_public_idempotency_key_key`
  ON `orders` (`business_id`, `public_idempotency_key_hash`);
