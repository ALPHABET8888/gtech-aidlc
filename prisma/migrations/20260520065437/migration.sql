/*
  Warnings:

  - You are about to alter the column `tx_type` on the `ap_open_item` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `tax_invoice_no` on the `ap_open_item` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `period` on the `ap_open_item` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(7)`.
  - You are about to alter the column `tx_type` on the `ar_open_item` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `tax_invoice_no` on the `ar_open_item` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `period` on the `ar_open_item` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(7)`.
  - You are about to alter the column `closed_by_type` on the `gr_ir_clearing` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.
  - You are about to alter the column `jo_number` on the `job_order` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(30)`.

*/
-- AlterTable
ALTER TABLE "transactions"."ap_open_item" ALTER COLUMN "tx_type" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "tax_invoice_no" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "due_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "period" SET DATA TYPE VARCHAR(7),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "transactions"."ap_payment_allocation" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "transactions"."ar_open_item" ALTER COLUMN "tx_type" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "tax_invoice_no" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "due_date" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "period" SET DATA TYPE VARCHAR(7),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "transactions"."ar_payment_allocation" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "transactions"."gr_ir_clearing" ALTER COLUMN "closed_by_type" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "closed_at" SET DATA TYPE TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "transactions"."job_order" ALTER COLUMN "jo_number" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ;

-- RenameIndex
ALTER INDEX "transactions"."idx_ap_alloc_open_item" RENAME TO "idx_ap_alloc_item";

-- RenameIndex
ALTER INDEX "transactions"."idx_ap_alloc_payment_tx" RENAME TO "idx_ap_alloc_payment";

-- RenameIndex
ALTER INDEX "transactions"."idx_ar_alloc_open_item" RENAME TO "idx_ar_alloc_item";

-- RenameIndex
ALTER INDEX "transactions"."idx_ar_alloc_payment_tx" RENAME TO "idx_ar_alloc_payment";

-- RenameIndex
ALTER INDEX "transactions"."idx_clearing_gr_return_tx" RENAME TO "idx_clearing_gr_return";

-- RenameIndex
ALTER INDEX "transactions"."idx_job_order_status_date" RENAME TO "idx_job_order_status_created";
