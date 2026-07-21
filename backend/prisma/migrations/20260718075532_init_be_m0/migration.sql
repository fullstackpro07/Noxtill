-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'manager', 'staff');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('product', 'service');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('counter', 'online', 'dine_in', 'takeaway', 'delivery', 'quotation');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'online', 'credit');

-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('credit', 'payment');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('booked', 'confirmed', 'completed', 'no_show', 'cancelled');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('link', 'qr', 'walk_in');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('whatsapp', 'sms', 'email');

-- CreateEnum
CREATE TYPE "MessageCategory" AS ENUM ('utility', 'marketing');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "ReviewRoute" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'assigned', 'resolved');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('purchase', 'sale', 'wastage', 'adjustment');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('csv', 'xlsx', 'text', 'docx');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('email', 'gmb', 'google_ads', 'merchant', 'meta_ads', 'tiktok_ads');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('not_connected', 'connected', 'needs_attention');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('sent', 'delivered', 'open', 'click', 'unsub');

-- CreateTable
CREATE TABLE "business_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_template" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_types" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_overrides" JSONB NOT NULL DEFAULT '{}',
    "widget_overrides" JSONB NOT NULL DEFAULT '{}',
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widgets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "data_endpoint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "msg_quota" INTEGER NOT NULL,
    "user_limit" INTEGER NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type_id" TEXT,
    "plan_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "country" TEXT,
    "channel_pref" "MessageChannel" NOT NULL DEFAULT 'whatsapp',
    "nightly_close_time" TEXT NOT NULL DEFAULT '22:00',
    "tax_label" TEXT NOT NULL DEFAULT 'Tax',
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "msg_quota" INTEGER NOT NULL DEFAULT 600,
    "msg_used" INTEGER NOT NULL DEFAULT 0,
    "branding" JSONB NOT NULL DEFAULT '{}',
    "dashboard_config" JSONB NOT NULL DEFAULT '{}',
    "public_review_url" TEXT,
    "parent_id" TEXT,
    "trial_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "refresh_token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_users" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "commission_rule" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "birthday" DATE,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consent_marketing" BOOLEAN NOT NULL DEFAULT true,
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "lifetime_spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "last_visit_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL DEFAULT 'product',
    "name" TEXT NOT NULL,
    "category" TEXT,
    "variations" JSONB NOT NULL DEFAULT '[]',
    "cost_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "selling_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "duration_min" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "customer_id" TEXT,
    "order_type" "OrderType" NOT NULL DEFAULT 'counter',
    "table_no" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_quotation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "provider_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_entries" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "staff_user_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'booked',
    "deposit_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "source" "AppointmentSource" NOT NULL DEFAULT 'link',
    "reschedule_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "template_key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "provider_ref" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("provider","event_id")
);

-- CreateTable
CREATE TABLE "review_requests" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "token" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT,
    "stars" INTEGER,
    "message" TEXT,
    "routed_to" "ReviewRoute",
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_feedback" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "review_request_id" TEXT,
    "customer_id" TEXT,
    "stars" INTEGER NOT NULL,
    "message" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "assigned_to" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_reviews" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "author" TEXT,
    "stars" INTEGER NOT NULL,
    "text" TEXT,
    "reply_text" TEXT,
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "supplier" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "incurred_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "check_in" TIMESTAMP(3) NOT NULL,
    "check_out" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "platform_ref" TEXT NOT NULL,
    "last_rating" DECIMAL(2,1),
    "last_reviews_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "errors_file_url" TEXT,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'not_connected',
    "tokens" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "integration_id" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "goal" TEXT NOT NULL,
    "budget" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "external_id" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "email_campaign_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "type" "EmailEventType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_feed_items" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sync_state" TEXT NOT NULL DEFAULT 'pending',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_feed_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmb_posts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "photo_url" TEXT,
    "button_type" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmb_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_categories_key_key" ON "business_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "business_types_key_key" ON "business_types"("key");

-- CreateIndex
CREATE INDEX "business_types_category_id_idx" ON "business_types"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "widgets_key_key" ON "widgets"("key");

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "business_users_business_id_idx" ON "business_users"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_users_business_id_user_id_key" ON "business_users"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "customers_business_id_name_idx" ON "customers"("business_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_business_id_phone_key" ON "customers"("business_id", "phone");

-- CreateIndex
CREATE INDEX "products_business_id_idx" ON "products"("business_id");

-- CreateIndex
CREATE INDEX "orders_business_id_status_idx" ON "orders"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_business_id_orderNo_key" ON "orders"("business_id", "orderNo");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "credit_entries_business_id_customer_id_idx" ON "credit_entries"("business_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_reschedule_token_key" ON "appointments"("reschedule_token");

-- CreateIndex
CREATE INDEX "appointments_business_id_starts_at_idx" ON "appointments"("business_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_staff_user_id_starts_at_idx" ON "appointments"("staff_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "messages_business_id_customer_id_idx" ON "messages"("business_id", "customer_id");

-- CreateIndex
CREATE INDEX "messages_status_scheduled_for_idx" ON "messages"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "review_requests_token_key" ON "review_requests"("token");

-- CreateIndex
CREATE INDEX "review_requests_business_id_idx" ON "review_requests"("business_id");

-- CreateIndex
CREATE INDEX "private_feedback_business_id_status_idx" ON "private_feedback"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "external_reviews_business_id_platform_external_id_key" ON "external_reviews"("business_id", "platform", "external_id");

-- CreateIndex
CREATE INDEX "stock_movements_business_id_product_id_idx" ON "stock_movements"("business_id", "product_id");

-- CreateIndex
CREATE INDEX "expenses_business_id_incurred_on_idx" ON "expenses"("business_id", "incurred_on");

-- CreateIndex
CREATE INDEX "attendance_business_id_staff_user_id_idx" ON "attendance"("business_id", "staff_user_id");

-- CreateIndex
CREATE INDEX "campaigns_business_id_idx" ON "campaigns"("business_id");

-- CreateIndex
CREATE INDEX "competitors_business_id_idx" ON "competitors"("business_id");

-- CreateIndex
CREATE INDEX "audit_log_business_id_entity_entity_id_idx" ON "audit_log"("business_id", "entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_business_id_content_hash_key" ON "import_batches"("business_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_business_id_provider_key" ON "integrations"("business_id", "provider");

-- CreateIndex
CREATE INDEX "ad_campaigns_business_id_idx" ON "ad_campaigns"("business_id");

-- CreateIndex
CREATE INDEX "email_campaigns_business_id_idx" ON "email_campaigns"("business_id");

-- CreateIndex
CREATE INDEX "email_events_email_campaign_id_idx" ON "email_events"("email_campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_feed_items_business_id_product_id_key" ON "product_feed_items"("business_id", "product_id");

-- CreateIndex
CREATE INDEX "gmb_posts_business_id_idx" ON "gmb_posts"("business_id");

-- AddForeignKey
ALTER TABLE "business_types" ADD CONSTRAINT "business_types_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "business_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "business_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_users" ADD CONSTRAINT "business_users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_users" ADD CONSTRAINT "business_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "business_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_review_request_id_fkey" FOREIGN KEY ("review_request_id") REFERENCES "review_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_reviews" ADD CONSTRAINT "external_reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "business_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_campaign_id_fkey" FOREIGN KEY ("email_campaign_id") REFERENCES "email_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feed_items" ADD CONSTRAINT "product_feed_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feed_items" ADD CONSTRAINT "product_feed_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmb_posts" ADD CONSTRAINT "gmb_posts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BE-005: pg_trgm for customer name/phone trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON "customers" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON "customers" USING gin ("phone" gin_trgm_ops);

-- BE-005: v_credit_balances — per-customer running balance
CREATE VIEW "v_credit_balances" AS
SELECT
  ce."business_id" AS business_id,
  ce."customer_id" AS customer_id,
  SUM(CASE WHEN ce."kind" = 'credit' THEN ce."amount" ELSE -ce."amount" END) AS balance,
  MAX(ce."created_at") AS last_entry_at,
  EXTRACT(DAY FROM now() - MAX(ce."created_at"))::int AS days_outstanding
FROM "credit_entries" ce
GROUP BY ce."business_id", ce."customer_id";

-- BE-005: v_daily_close — per-business per-day sales, gross profit, orders
CREATE VIEW "v_daily_close" AS
SELECT
  o."business_id" AS business_id,
  DATE(o."created_at") AS close_date,
  COUNT(*) AS orders_count,
  SUM(o."total") AS revenue,
  SUM(o."cogs") AS cogs,
  SUM(o."total" - o."cogs") AS gross_profit
FROM "orders" o
WHERE o."status" = 'completed'
GROUP BY o."business_id", DATE(o."created_at");

-- BE-004/BE-009: audit_log is append-only — revoke mutate/delete privileges from PUBLIC.
-- A dedicated least-privileged application role should be granted only INSERT/SELECT in production;
-- this REVOKE is a no-op for the superuser role typically used in local dev.
REVOKE UPDATE, DELETE ON "audit_log" FROM PUBLIC;
REVOKE UPDATE, DELETE ON "webhook_events" FROM PUBLIC;
