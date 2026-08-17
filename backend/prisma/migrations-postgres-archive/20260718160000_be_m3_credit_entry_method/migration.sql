-- BE-030: credit ledger payments need a method (cash/card/online), same as order Payment.
ALTER TABLE "credit_entries" ADD COLUMN "method" "PaymentMethod";
