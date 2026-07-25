-- BE-M8: attribute a sale to the staff member who rang it up, for commission reporting (BE-058).
ALTER TABLE "orders" ADD COLUMN "staff_user_id" TEXT;

ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_user_id_fkey"
  FOREIGN KEY ("staff_user_id") REFERENCES "business_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
