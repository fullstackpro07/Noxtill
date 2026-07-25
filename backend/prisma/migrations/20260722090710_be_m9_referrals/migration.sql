-- BE-M9: referral reward config + who-referred-whom tracking (BE-062).
ALTER TABLE "businesses" ADD COLUMN "referral_settings" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "customers" ADD COLUMN "referred_by_customer_id" TEXT;

ALTER TABLE "customers" ADD CONSTRAINT "customers_referred_by_customer_id_fkey"
  FOREIGN KEY ("referred_by_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
