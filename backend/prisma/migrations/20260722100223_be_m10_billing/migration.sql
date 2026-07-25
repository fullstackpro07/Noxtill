-- BE-M10: Stripe linkage for plans (product/price) and businesses (customer/subscription).
ALTER TABLE "plans" ADD COLUMN "stripe_price_id" TEXT;
CREATE UNIQUE INDEX "plans_stripe_price_id_key" ON "plans"("stripe_price_id");

ALTER TABLE "businesses" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "businesses" ADD COLUMN "stripe_subscription_id" TEXT;
CREATE UNIQUE INDEX "businesses_stripe_customer_id_key" ON "businesses"("stripe_customer_id");
CREATE UNIQUE INDEX "businesses_stripe_subscription_id_key" ON "businesses"("stripe_subscription_id");
