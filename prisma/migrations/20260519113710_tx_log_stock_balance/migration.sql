-- CreateEnum
CREATE TYPE "transactions"."TxType" AS ENUM ('JOB_ORDER', 'TEMP_DO', 'INVOICE_FROM_DO', 'SALE_INVOICE', 'CN_SALES_RETURN', 'CN_SALES_PRICE', 'AR_RECEIVE', 'AR_CN_DEBT', 'AR_DN', 'GR_RECEIVE', 'GR_RETURN', 'GR_REPLACEMENT', 'CN_RETURN', 'CN_PRICE_ADJ', 'AP_CN_DEBT', 'AP_PAYMENT', 'AP_DN', 'AP_DN_REF', 'ADJ_COUNT_UP', 'ADJ_COUNT_DOWN', 'ADJ_WRITEDOWN', 'ADJ_WRITEOFF', 'ADJ_TRANSFER', 'ADJ_RECLASS', 'ADJ_COST', 'SUPPLY_ISSUE', 'WHT_RECORD', 'CHEQUE_RECEIVE', 'EXPENSE_RECORD', 'VOID');

-- CreateEnum
CREATE TYPE "transactions"."TxStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "transactions"."VatType" AS ENUM ('INPUT', 'OUTPUT', 'NONE');

-- CreateTable
CREATE TABLE "transactions"."tx_log" (
    "id" UUID NOT NULL,
    "tx_type" "transactions"."TxType" NOT NULL,
    "tx_status" "transactions"."TxStatus" NOT NULL DEFAULT 'DRAFT',
    "tx_date" TIMESTAMPTZ NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "item_id" UUID,
    "warehouse_id" UUID,
    "qty" DECIMAL(12,4),
    "unit_cost" DECIMAL(12,2),
    "total_cost" DECIMAL(14,2),
    "ma_before" DECIMAL(12,2),
    "ma_after" DECIMAL(12,2),
    "stock_before" DECIMAL(12,4),
    "stock_after" DECIMAL(12,4),
    "vendor_id" UUID,
    "customer_id" UUID,
    "ref_jo_id" UUID,
    "ref_do_id" UUID,
    "ref_invoice_id" UUID,
    "ref_gr_id" UUID,
    "ref_cn_id" UUID,
    "parent_tx_id" UUID,
    "tax_invoice_no" VARCHAR(50),
    "base_amount" DECIMAL(14,2),
    "vat_amount" DECIMAL(14,2),
    "vat_type" "transactions"."VatType",
    "ar_amount" DECIMAL(14,2),
    "ap_amount" DECIMAL(14,2),
    "ap_ar_status" "transactions"."ApArStatus",
    "cogs_unit" DECIMAL(12,2),
    "reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tx_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions"."stock_balance" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "qty" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ma" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_frozen" BOOLEAN NOT NULL DEFAULT false,
    "last_tx_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_tx_log_type_period" ON "transactions"."tx_log"("tx_type", "period");

-- CreateIndex
CREATE INDEX "idx_tx_log_item_warehouse" ON "transactions"."tx_log"("item_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "idx_tx_log_status" ON "transactions"."tx_log"("tx_status");

-- CreateIndex
CREATE INDEX "idx_tx_log_customer" ON "transactions"."tx_log"("customer_id");

-- CreateIndex
CREATE INDEX "idx_tx_log_vendor" ON "transactions"."tx_log"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_tx_log_parent" ON "transactions"."tx_log"("parent_tx_id");

-- CreateIndex
CREATE INDEX "idx_stock_balance_frozen" ON "transactions"."stock_balance"("is_frozen");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balance_item_id_warehouse_id_key" ON "transactions"."stock_balance"("item_id", "warehouse_id");

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "master_data"."item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "master_data"."warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_data"."vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "master_data"."customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_parent_tx_id_fkey" FOREIGN KEY ("parent_tx_id") REFERENCES "transactions"."tx_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_ref_jo_id_fkey" FOREIGN KEY ("ref_jo_id") REFERENCES "transactions"."tx_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_ref_do_id_fkey" FOREIGN KEY ("ref_do_id") REFERENCES "transactions"."tx_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_ref_invoice_id_fkey" FOREIGN KEY ("ref_invoice_id") REFERENCES "transactions"."tx_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_ref_gr_id_fkey" FOREIGN KEY ("ref_gr_id") REFERENCES "transactions"."tx_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."tx_log" ADD CONSTRAINT "tx_log_ref_cn_id_fkey" FOREIGN KEY ("ref_cn_id") REFERENCES "transactions"."tx_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."stock_balance" ADD CONSTRAINT "stock_balance_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "master_data"."item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."stock_balance" ADD CONSTRAINT "stock_balance_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "master_data"."warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions"."stock_balance" ADD CONSTRAINT "stock_balance_last_tx_id_fkey" FOREIGN KEY ("last_tx_id") REFERENCES "transactions"."tx_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;
