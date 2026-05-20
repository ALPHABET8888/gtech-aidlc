-- CreateEnum
CREATE TYPE "transactions"."JOStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "transactions"."ApArStatus" AS ENUM ('OPEN', 'PARTIAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "transactions"."ClearingStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "master_data"."refresh_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "master_data"."users" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "transactions"."job_order" (
    "id" UUID NOT NULL,
    "jo_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "transactions"."JOStatus" NOT NULL DEFAULT 'OPEN',
    "has_temp_do" BOOLEAN NOT NULL DEFAULT false,
    "temp_do_id" UUID,
    "invoice_id" UUID,
    "items" JSONB NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "vat_amount" DECIMAL(12,2) NOT NULL,
    "grand_total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions"."ap_open_item" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "tx_id" UUID NOT NULL,
    "tx_type" TEXT NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "remaining_amount" DECIMAL(12,2) NOT NULL,
    "vat_amount" DECIMAL(12,2) NOT NULL,
    "status" "transactions"."ApArStatus" NOT NULL DEFAULT 'OPEN',
    "tax_invoice_no" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ap_open_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions"."ar_open_item" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "tx_id" UUID NOT NULL,
    "tx_type" TEXT NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "remaining_amount" DECIMAL(12,2) NOT NULL,
    "vat_amount" DECIMAL(12,2) NOT NULL,
    "status" "transactions"."ApArStatus" NOT NULL DEFAULT 'OPEN',
    "tax_invoice_no" TEXT,
    "due_date" TIMESTAMP(3),
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ar_open_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions"."ap_payment_allocation" (
    "id" UUID NOT NULL,
    "payment_tx_id" UUID NOT NULL,
    "ap_open_item_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ap_payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions"."ar_payment_allocation" (
    "id" UUID NOT NULL,
    "payment_tx_id" UUID NOT NULL,
    "ar_open_item_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ar_payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions"."gr_ir_clearing" (
    "id" UUID NOT NULL,
    "gr_return_tx_id" UUID NOT NULL,
    "gr_receive_tx_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(12,4) NOT NULL,
    "clearing_amount" DECIMAL(12,2) NOT NULL,
    "status" "transactions"."ClearingStatus" NOT NULL DEFAULT 'OPEN',
    "closed_by_tx_id" UUID,
    "closed_by_type" TEXT,
    "ppv_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "gr_ir_clearing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_order_jo_number_key" ON "transactions"."job_order"("jo_number");

-- CreateIndex
CREATE INDEX "idx_job_order_customer" ON "transactions"."job_order"("customer_id");

-- CreateIndex
CREATE INDEX "idx_job_order_status_date" ON "transactions"."job_order"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_ap_open_item_vendor_status" ON "transactions"."ap_open_item"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "idx_ap_open_item_status_due" ON "transactions"."ap_open_item"("status", "due_date");

-- CreateIndex
CREATE INDEX "idx_ar_open_item_customer_status" ON "transactions"."ar_open_item"("customer_id", "status");

-- CreateIndex
CREATE INDEX "idx_ar_open_item_status_due" ON "transactions"."ar_open_item"("status", "due_date");

-- CreateIndex
CREATE INDEX "idx_ap_alloc_payment_tx" ON "transactions"."ap_payment_allocation"("payment_tx_id");

-- CreateIndex
CREATE INDEX "idx_ap_alloc_open_item" ON "transactions"."ap_payment_allocation"("ap_open_item_id");

-- CreateIndex
CREATE INDEX "idx_ar_alloc_payment_tx" ON "transactions"."ar_payment_allocation"("payment_tx_id");

-- CreateIndex
CREATE INDEX "idx_ar_alloc_open_item" ON "transactions"."ar_payment_allocation"("ar_open_item_id");

-- CreateIndex
CREATE INDEX "idx_clearing_vendor_status" ON "transactions"."gr_ir_clearing"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "idx_clearing_gr_return_tx" ON "transactions"."gr_ir_clearing"("gr_return_tx_id");

-- AddForeignKey
ALTER TABLE "transactions"."ap_payment_allocation" ADD CONSTRAINT "ap_payment_allocation_ap_open_item_id_fkey" FOREIGN KEY ("ap_open_item_id") REFERENCES "transactions"."ap_open_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."ar_payment_allocation" ADD CONSTRAINT "ar_payment_allocation_ar_open_item_id_fkey" FOREIGN KEY ("ar_open_item_id") REFERENCES "transactions"."ar_open_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
