-- CreateTable
CREATE TABLE "master_data"."role" (
    "id" UUID NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "description" VARCHAR(200),

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."user_role" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."period" (
    "id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "closed_by" UUID,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."item" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "category" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."warehouse" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "location" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."vendor" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tax_id" VARCHAR(20),
    "address" TEXT,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data"."customer" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tax_id" VARCHAR(20),
    "address" TEXT,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "master_data"."role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_user_id_role_id_key" ON "master_data"."user_role"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "period_period_key" ON "master_data"."period"("period");

-- CreateIndex
CREATE UNIQUE INDEX "item_code_key" ON "master_data"."item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_code_key" ON "master_data"."warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_code_key" ON "master_data"."vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_code_key" ON "master_data"."customer"("code");

-- AddForeignKey
ALTER TABLE "master_data"."user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "master_data"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "master_data"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."period" ADD CONSTRAINT "period_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "master_data"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data"."period" ADD CONSTRAINT "period_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "master_data"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
