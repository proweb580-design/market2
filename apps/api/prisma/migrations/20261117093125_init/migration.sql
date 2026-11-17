-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "app"."ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "app"."SessionKind" AS ENUM ('WEB', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "app"."RoleScope" AS ENUM ('PLATFORM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "app"."OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "app"."MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "app"."IntegrationKind" AS ENUM ('TELEGRAM_BOT', 'PAYMENT_PROVIDER');

-- CreateEnum
CREATE TYPE "app"."IntegrationStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "app"."BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "app"."SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "app"."SubscriptionEventType" AS ENUM ('CREATED', 'TRIAL_STARTED', 'UPGRADED', 'DOWNGRADE_SCHEDULED', 'DOWNGRADED', 'RENEWED', 'PAYMENT_FAILED', 'CANCEL_SCHEDULED', 'RESUMED', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "app"."PaymentPurpose" AS ENUM ('SUBSCRIPTION', 'ORDER');

-- CreateEnum
CREATE TYPE "app"."PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "app"."TransactionType" AS ENUM ('CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "app"."TransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "app"."WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "app"."ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "app"."Gender" AS ENUM ('WOMAN', 'MAN', 'UNISEX');

-- CreateEnum
CREATE TYPE "app"."CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "app"."OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FULFILLED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "app"."OrderSource" AS ENUM ('WEB', 'TELEGRAM', 'API');

-- CreateEnum
CREATE TYPE "app"."HomeSectionType" AS ENUM ('HERO', 'FEATURED', 'PRODUCT_GRID', 'DROP_COUNTDOWN', 'COLLECTIONS', 'SOCIAL_FEED', 'TESTIMONIALS');

-- CreateTable
CREATE TABLE "app"."users" (
    "id" UUID NOT NULL,
    "supabase_id" UUID,
    "email" TEXT,
    "status" "app"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "blocked_at" TIMESTAMPTZ(3),
    "blocked_reason" TEXT,
    "last_seen_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."profiles" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "timezone" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "app"."user_settings" (
    "user_id" UUID NOT NULL,
    "theme" "app"."ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "marketing_emails" BOOLEAN NOT NULL DEFAULT false,
    "notifications" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "app"."telegram_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "photo_url" TEXT,
    "language_code" TEXT,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_auth_at" TIMESTAMPTZ(3),

    CONSTRAINT "telegram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "app"."SessionKind" NOT NULL,
    "refresh_token_hash" TEXT,
    "supabase_session_id" UUID,
    "organization_id" UUID,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_api_key_id" UUID,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "app"."RoleScope" NOT NULL,
    "organization_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" "app"."RoleScope" NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "app"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "app"."organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "app"."OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "custom_domain" TEXT,
    "logo_url" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "next_order_number" INTEGER NOT NULL DEFAULT 1001,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "status" "app"."MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "invited_by_id" UUID,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."integrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "app"."IntegrationKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "secret_encrypted" TEXT,
    "public_config" JSONB NOT NULL DEFAULT '{}',
    "status" "app"."IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "interval" "app"."BillingInterval" NOT NULL,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."plan_features" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "feature_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limit_value" INTEGER,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."subscriptions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "app"."SubscriptionStatus" NOT NULL,
    "current_period_start" TIMESTAMPTZ(3) NOT NULL,
    "current_period_end" TIMESTAMPTZ(3) NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_plan_id" UUID,
    "canceled_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "provider_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."subscription_events" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "type" "app"."SubscriptionEventType" NOT NULL,
    "from_plan_id" UUID,
    "to_plan_id" UUID,
    "actor_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purpose" "app"."PaymentPurpose" NOT NULL,
    "subscription_id" UUID,
    "order_id" UUID,
    "provider" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "app"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT,
    "confirmation_url" TEXT,
    "failure_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."transactions" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" "app"."TransactionType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "app"."TransactionStatus" NOT NULL,
    "provider_transaction_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "app"."WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "expires_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."api_logs" (
    "id" UUID NOT NULL,
    "api_key_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."media_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_sec" INTEGER,
    "alt" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."size_charts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "size_charts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "label" TEXT,
    "status" "app"."ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "gender" "app"."Gender" NOT NULL DEFAULT 'UNISEX',
    "size_chart_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."product_options" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."product_option_values" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "swatch_hex" CHAR(7),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."product_variants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" TEXT,
    "price_minor" BIGINT NOT NULL,
    "compare_at_price_minor" BIGINT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."variant_option_values" (
    "variant_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,

    CONSTRAINT "variant_option_values_pkey" PRIMARY KEY ("variant_id","option_value_id")
);

-- CreateTable
CREATE TABLE "app"."product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_file_id" UUID NOT NULL,
    "option_value_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."collections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."collection_products" (
    "collection_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collection_id","product_id")
);

-- CreateTable
CREATE TABLE "app"."carts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_token_hash" TEXT,
    "status" "app"."CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "user_id" UUID,
    "status" "app"."OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "source" "app"."OrderSource" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor" BIGINT NOT NULL,
    "shipping_minor" BIGINT NOT NULL DEFAULT 0,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "total_minor" BIGINT NOT NULL,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "shipping_address" JSONB,
    "note" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_title" TEXT NOT NULL,
    "variant_title" TEXT NOT NULL,
    "sku" TEXT,
    "unit_price_minor" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_minor" BIGINT NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."wishlist_items" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateTable
CREATE TABLE "app"."home_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "app"."HomeSectionType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."lookbooks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lookbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."lookbook_items" (
    "id" UUID NOT NULL,
    "lookbook_id" UUID NOT NULL,
    "media_file_id" UUID NOT NULL,
    "tag" TEXT,
    "title" TEXT,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lookbook_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."testimonials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "location" TEXT,
    "quote" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."playlist_tracks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "audio_file_id" UUID,
    "cover_file_id" UUID,
    "duration_sec" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."newsletter_subscribers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "unsubscribed_at" TIMESTAMPTZ(3),
    "source" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_id_key" ON "app"."users"("supabase_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "app"."users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "app"."users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_accounts_user_id_key" ON "app"."telegram_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_accounts_telegram_id_key" ON "app"."telegram_accounts"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "app"."sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_supabase_session_id_key" ON "app"."sessions"("supabase_session_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "app"."sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "app"."audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "app"."audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "app"."audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "app"."notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_key_key" ON "app"."roles"("organization_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "app"."permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "app"."role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "app"."user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "app"."organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_custom_domain_key" ON "app"."organizations"("custom_domain");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "app"."organizations"("status");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "app"."organization_members"("user_id");

-- CreateIndex
CREATE INDEX "organization_members_role_id_idx" ON "app"."organization_members"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "app"."organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "app"."invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_email_idx" ON "app"."invitations"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_organization_id_kind_provider_key" ON "app"."integrations"("organization_id", "kind", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "app"."plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key_key" ON "app"."plan_features"("plan_id", "feature_key");

-- CreateIndex
CREATE INDEX "subscriptions_organization_id_created_at_idx" ON "app"."subscriptions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "app"."subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "subscription_events_subscription_id_created_at_idx" ON "app"."subscription_events"("subscription_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "app"."payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_organization_id_created_at_idx" ON "app"."payments"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "app"."payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_payment_id_key" ON "app"."payments"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "transactions_payment_id_created_at_idx" ON "app"."transactions"("payment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_payment_id_provider_transaction_id_key" ON "app"."transactions"("payment_id", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "app"."webhook_events"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "app"."webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "app"."idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "app"."idempotency_keys"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "app"."api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "app"."api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "app"."api_keys"("organization_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "app"."api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_logs_api_key_id_created_at_idx" ON "app"."api_logs"("api_key_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_files_storage_key_key" ON "app"."media_files"("storage_key");

-- CreateIndex
CREATE INDEX "media_files_organization_id_created_at_idx" ON "app"."media_files"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "size_charts_organization_id_idx" ON "app"."size_charts"("organization_id");

-- CreateIndex
CREATE INDEX "products_organization_id_status_sort_order_idx" ON "app"."products"("organization_id", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_slug_key" ON "app"."products"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_product_id_name_key" ON "app"."product_options"("product_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_values_option_id_value_key" ON "app"."product_option_values"("option_id", "value");

-- CreateIndex
CREATE INDEX "product_variants_product_id_position_idx" ON "app"."product_variants"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_sku_key" ON "app"."product_variants"("organization_id", "sku");

-- CreateIndex
CREATE INDEX "variant_option_values_option_value_id_idx" ON "app"."variant_option_values"("option_value_id");

-- CreateIndex
CREATE INDEX "product_media_product_id_position_idx" ON "app"."product_media"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_product_id_media_file_id_key" ON "app"."product_media"("product_id", "media_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_organization_id_slug_key" ON "app"."collections"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "collection_products_product_id_idx" ON "app"."collection_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_anonymous_token_hash_key" ON "app"."carts"("anonymous_token_hash");

-- CreateIndex
CREATE INDEX "carts_organization_id_user_id_status_idx" ON "app"."carts"("organization_id", "user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "app"."cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "orders_organization_id_status_created_at_idx" ON "app"."orders"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "app"."orders"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_organization_id_number_key" ON "app"."orders"("organization_id", "number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "app"."order_items"("order_id");

-- CreateIndex
CREATE INDEX "wishlist_items_user_id_organization_id_idx" ON "app"."wishlist_items"("user_id", "organization_id");

-- CreateIndex
CREATE INDEX "home_sections_organization_id_position_idx" ON "app"."home_sections"("organization_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lookbooks_organization_id_slug_key" ON "app"."lookbooks"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "lookbook_items_lookbook_id_position_idx" ON "app"."lookbook_items"("lookbook_id", "position");

-- CreateIndex
CREATE INDEX "testimonials_organization_id_position_idx" ON "app"."testimonials"("organization_id", "position");

-- CreateIndex
CREATE INDEX "playlist_tracks_organization_id_position_idx" ON "app"."playlist_tracks"("organization_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_organization_id_email_key" ON "app"."newsletter_subscribers"("organization_id", "email");

-- AddForeignKey
ALTER TABLE "app"."profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."telegram_accounts" ADD CONSTRAINT "telegram_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_actor_api_key_id_fkey" FOREIGN KEY ("actor_api_key_id") REFERENCES "app"."api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "app"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."organizations" ADD CONSTRAINT "organizations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."organization_members" ADD CONSTRAINT "organization_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."organization_members" ADD CONSTRAINT "organization_members_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."integrations" ADD CONSTRAINT "integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "app"."plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_scheduled_plan_id_fkey" FOREIGN KEY ("scheduled_plan_id") REFERENCES "app"."plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "app"."subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscription_events" ADD CONSTRAINT "subscription_events_from_plan_id_fkey" FOREIGN KEY ("from_plan_id") REFERENCES "app"."plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscription_events" ADD CONSTRAINT "subscription_events_to_plan_id_fkey" FOREIGN KEY ("to_plan_id") REFERENCES "app"."plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subscription_events" ADD CONSTRAINT "subscription_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "app"."subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "app"."payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."api_logs" ADD CONSTRAINT "api_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "app"."api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."media_files" ADD CONSTRAINT "media_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."media_files" ADD CONSTRAINT "media_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."size_charts" ADD CONSTRAINT "size_charts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."products" ADD CONSTRAINT "products_size_chart_id_fkey" FOREIGN KEY ("size_chart_id") REFERENCES "app"."size_charts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_options" ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_option_values" ADD CONSTRAINT "product_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "app"."product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_variants" ADD CONSTRAINT "product_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."variant_option_values" ADD CONSTRAINT "variant_option_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "app"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."variant_option_values" ADD CONSTRAINT "variant_option_values_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "app"."product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_media" ADD CONSTRAINT "product_media_media_file_id_fkey" FOREIGN KEY ("media_file_id") REFERENCES "app"."media_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."product_media" ADD CONSTRAINT "product_media_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "app"."product_option_values"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."collections" ADD CONSTRAINT "collections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."collections" ADD CONSTRAINT "collections_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "app"."media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "app"."collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."carts" ADD CONSTRAINT "carts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "app"."carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "app"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "app"."product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."wishlist_items" ADD CONSTRAINT "wishlist_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."home_sections" ADD CONSTRAINT "home_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."lookbooks" ADD CONSTRAINT "lookbooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."lookbook_items" ADD CONSTRAINT "lookbook_items_lookbook_id_fkey" FOREIGN KEY ("lookbook_id") REFERENCES "app"."lookbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."lookbook_items" ADD CONSTRAINT "lookbook_items_media_file_id_fkey" FOREIGN KEY ("media_file_id") REFERENCES "app"."media_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."testimonials" ADD CONSTRAINT "testimonials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."playlist_tracks" ADD CONSTRAINT "playlist_tracks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."playlist_tracks" ADD CONSTRAINT "playlist_tracks_audio_file_id_fkey" FOREIGN KEY ("audio_file_id") REFERENCES "app"."media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."playlist_tracks" ADD CONSTRAINT "playlist_tracks_cover_file_id_fkey" FOREIGN KEY ("cover_file_id") REFERENCES "app"."media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."platform_settings" ADD CONSTRAINT "platform_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Hand-written constraints Prisma's schema language can't express.
-- Keep in sync with docs/database.md §Constraints.
-- ═══════════════════════════════════════════════════════════════════════════

-- RBAC: system role keys are unique (NULL organization_id is distinct in a normal unique index).
CREATE UNIQUE INDEX "roles_system_key_key" ON "app"."roles"("key") WHERE "organization_id" IS NULL;
ALTER TABLE "app"."roles"
  ADD CONSTRAINT "roles_system_has_no_org_chk" CHECK (NOT "is_system" OR "organization_id" IS NULL),
  ADD CONSTRAINT "roles_custom_is_org_scope_chk" CHECK ("organization_id" IS NULL OR "scope" = 'ORGANIZATION');

-- RBAC: platform assignments only take PLATFORM roles; memberships/invitations only take
-- ORGANIZATION roles that are system-wide or belong to the same organization (blocks cross-tenant role use).
CREATE FUNCTION "app"."assert_platform_role"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "app"."roles" r WHERE r."id" = NEW."role_id" AND r."scope" = 'PLATFORM') THEN
    RAISE EXCEPTION 'role % is not a platform role', NEW."role_id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION "app"."assert_org_role"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "app"."roles" r
    WHERE r."id" = NEW."role_id" AND r."scope" = 'ORGANIZATION'
      AND (r."organization_id" IS NULL OR r."organization_id" = NEW."organization_id")
  ) THEN
    RAISE EXCEPTION 'role % is not available in organization %', NEW."role_id", NEW."organization_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "user_roles_platform_role" BEFORE INSERT OR UPDATE OF "role_id" ON "app"."user_roles"
  FOR EACH ROW EXECUTE FUNCTION "app"."assert_platform_role"();
CREATE TRIGGER "organization_members_org_role" BEFORE INSERT OR UPDATE OF "role_id", "organization_id" ON "app"."organization_members"
  FOR EACH ROW EXECUTE FUNCTION "app"."assert_org_role"();
CREATE TRIGGER "invitations_org_role" BEFORE INSERT OR UPDATE OF "role_id", "organization_id" ON "app"."invitations"
  FOR EACH ROW EXECUTE FUNCTION "app"."assert_org_role"();

-- Identity
ALTER TABLE "app"."users" ADD CONSTRAINT "users_email_lower_chk" CHECK ("email" = lower("email"));
ALTER TABLE "app"."telegram_accounts" ADD CONSTRAINT "telegram_accounts_id_positive_chk" CHECK ("telegram_id" > 0);
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_kind_token_chk" CHECK (
  ("kind" = 'WEB' AND "supabase_session_id" IS NOT NULL) OR ("kind" = 'TELEGRAM' AND "refresh_token_hash" IS NOT NULL)
);

-- Tenancy
ALTER TABLE "app"."organizations"
  ADD CONSTRAINT "organizations_slug_format_chk" CHECK ("slug" ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  ADD CONSTRAINT "organizations_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "organizations_next_order_number_chk" CHECK ("next_order_number" > 0);
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_email_lower_chk" CHECK ("email" = lower("email"));
CREATE UNIQUE INDEX "invitations_one_pending_per_email" ON "app"."invitations"("organization_id", "email")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- Plans & subscriptions
ALTER TABLE "app"."plans"
  ADD CONSTRAINT "plans_price_chk" CHECK ("price_minor" >= 0),
  ADD CONSTRAINT "plans_trial_chk" CHECK ("trial_days" >= 0),
  ADD CONSTRAINT "plans_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "app"."plan_features" ADD CONSTRAINT "plan_features_limit_chk" CHECK ("limit_value" IS NULL OR "limit_value" >= 0);
-- One live subscription per organization; history rows (CANCELED/EXPIRED) are unlimited.
CREATE UNIQUE INDEX "subscriptions_one_live_per_org" ON "app"."subscriptions"("organization_id")
  WHERE "status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE');
ALTER TABLE "app"."subscriptions" ADD CONSTRAINT "subscriptions_period_chk" CHECK ("current_period_end" > "current_period_start");

-- Payments
ALTER TABLE "app"."payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "payments_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "payments_purpose_target_chk" CHECK (
    ("purpose" = 'SUBSCRIPTION' AND "subscription_id" IS NOT NULL AND "order_id" IS NULL)
    OR ("purpose" = 'ORDER' AND "order_id" IS NOT NULL AND "subscription_id" IS NULL)
  );
ALTER TABLE "app"."transactions"
  ADD CONSTRAINT "transactions_amount_chk" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "transactions_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$');

-- API keys
ALTER TABLE "app"."api_keys"
  ADD CONSTRAINT "api_keys_owner_chk" CHECK ("organization_id" IS NOT NULL OR "user_id" IS NOT NULL),
  ADD CONSTRAINT "api_keys_rate_limit_chk" CHECK ("rate_limit_per_minute" > 0);

-- Catalog
ALTER TABLE "app"."product_variants"
  ADD CONSTRAINT "product_variants_price_chk" CHECK ("price_minor" >= 0),
  ADD CONSTRAINT "product_variants_compare_at_chk" CHECK ("compare_at_price_minor" IS NULL OR "compare_at_price_minor" >= 0),
  ADD CONSTRAINT "product_variants_stock_chk" CHECK ("stock" >= 0);
ALTER TABLE "app"."product_option_values"
  ADD CONSTRAINT "product_option_values_swatch_chk" CHECK ("swatch_hex" IS NULL OR "swatch_hex" ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE "app"."media_files" ADD CONSTRAINT "media_files_size_chk" CHECK ("size_bytes" >= 0);

-- Commerce
ALTER TABLE "app"."carts" ADD CONSTRAINT "carts_owner_chk" CHECK ("user_id" IS NOT NULL OR "anonymous_token_hash" IS NOT NULL);
CREATE UNIQUE INDEX "carts_one_active_per_user" ON "app"."carts"("organization_id", "user_id")
  WHERE "status" = 'ACTIVE' AND "user_id" IS NOT NULL;
ALTER TABLE "app"."cart_items" ADD CONSTRAINT "cart_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 99);
ALTER TABLE "app"."orders"
  ADD CONSTRAINT "orders_number_chk" CHECK ("number" > 0),
  ADD CONSTRAINT "orders_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "orders_amounts_chk" CHECK (
    "subtotal_minor" >= 0 AND "shipping_minor" >= 0 AND "discount_minor" >= 0 AND "tax_minor" >= 0
    AND "total_minor" = "subtotal_minor" + "shipping_minor" + "tax_minor" - "discount_minor"
    AND "total_minor" >= 0
  );
ALTER TABLE "app"."order_items"
  ADD CONSTRAINT "order_items_quantity_chk" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_total_chk" CHECK ("unit_price_minor" >= 0 AND "total_minor" = "unit_price_minor" * "quantity");

-- Content
ALTER TABLE "app"."newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_email_lower_chk" CHECK ("email" = lower("email"));
ALTER TABLE "app"."playlist_tracks" ADD CONSTRAINT "playlist_tracks_duration_chk" CHECK ("duration_sec" > 0);
