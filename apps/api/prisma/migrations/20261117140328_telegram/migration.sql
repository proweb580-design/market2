-- CreateTable
CREATE TABLE "app"."telegram_init_data_uses" (
    "hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "telegram_init_data_uses_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "app"."telegram_link_codes" (
    "id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_init_data_uses_expires_at_idx" ON "app"."telegram_init_data_uses"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_codes_code_hash_key" ON "app"."telegram_link_codes"("code_hash");

-- CreateIndex
CREATE INDEX "telegram_link_codes_user_id_idx" ON "app"."telegram_link_codes"("user_id");

-- AddForeignKey
ALTER TABLE "app"."telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
