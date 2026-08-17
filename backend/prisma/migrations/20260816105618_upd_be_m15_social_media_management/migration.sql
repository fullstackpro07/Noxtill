-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'snapchat', 'threads', 'reddit', 'tumblr', 'telegram', 'discord', 'wechat', 'line');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('not_connected', 'connected', 'needs_attention');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('draft', 'scheduled', 'publishing', 'published', 'partially_failed', 'failed');

-- CreateEnum
CREATE TYPE "SocialPostTargetStatus" AS ENUM ('pending', 'published', 'failed');

-- CreateEnum
CREATE TYPE "SocialInboxKind" AS ENUM ('comment', 'dm');

-- CreateEnum
CREATE TYPE "SocialInboxStatus" AS ENUM ('unread', 'read', 'replied');

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'not_connected',
    "tokens" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "external_account_id" TEXT,
    "external_account_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "prompt" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "mediaKeys" JSONB NOT NULL DEFAULT '[]',
    "scheduled_for" TIMESTAMP(3),
    "status" "SocialPostStatus" NOT NULL DEFAULT 'draft',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_targets" (
    "id" TEXT NOT NULL,
    "social_post_id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "status" "SocialPostTargetStatus" NOT NULL DEFAULT 'pending',
    "external_id" TEXT,
    "error_message" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_post_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_inbox_items" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "kind" "SocialInboxKind" NOT NULL,
    "author_name" TEXT,
    "text" TEXT NOT NULL,
    "post_external_id" TEXT,
    "status" "SocialInboxStatus" NOT NULL DEFAULT 'unread',
    "replied_text" TEXT,
    "replied_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "engagement" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_settings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "auto_post_rules" JSONB NOT NULL DEFAULT '{}',
    "hashtag_sets" JSONB NOT NULL DEFAULT '{}',
    "brand_voice" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_business_id_platform_key" ON "social_accounts"("business_id", "platform");

-- CreateIndex
CREATE INDEX "media_assets_business_id_idx" ON "media_assets"("business_id");

-- CreateIndex
CREATE INDEX "social_posts_business_id_idx" ON "social_posts"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_targets_social_post_id_platform_key" ON "social_post_targets"("social_post_id", "platform");

-- CreateIndex
CREATE INDEX "social_inbox_items_business_id_status_idx" ON "social_inbox_items"("business_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "social_inbox_items_business_id_platform_external_id_key" ON "social_inbox_items"("business_id", "platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_analytics_snapshots_business_id_platform_date_key" ON "social_analytics_snapshots"("business_id", "platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "social_settings_business_id_key" ON "social_settings"("business_id");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "social_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_inbox_items" ADD CONSTRAINT "social_inbox_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_analytics_snapshots" ADD CONSTRAINT "social_analytics_snapshots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_settings" ADD CONSTRAINT "social_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
