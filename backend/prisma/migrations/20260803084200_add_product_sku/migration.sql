-- INT-003: add optional SKU to products (needed for POS barcode/SKU lookup).
ALTER TABLE "products" ADD COLUMN "sku" TEXT;

CREATE UNIQUE INDEX "products_business_id_sku_key" ON "products"("business_id", "sku");
