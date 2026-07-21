-- DropIndex
DROP INDEX "customers_name_trgm_idx";

-- DropIndex
DROP INDEX "customers_phone_trgm_idx";

-- CreateTable
CREATE TABLE "whatsapp_windows" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_windows_business_id_customer_id_key" ON "whatsapp_windows"("business_id", "customer_id");

-- AddForeignKey
ALTER TABLE "whatsapp_windows" ADD CONSTRAINT "whatsapp_windows_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_windows" ADD CONSTRAINT "whatsapp_windows_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
