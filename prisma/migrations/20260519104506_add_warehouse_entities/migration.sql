-- CreateEnum
CREATE TYPE "warehouse"."CountSessionStatus" AS ENUM ('INITIATED', 'COUNTING', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "warehouse"."TransferStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "warehouse"."WriteOffStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED');

-- CreateTable
CREATE TABLE "warehouse"."count_sessions" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "warehouse"."CountSessionStatus" NOT NULL DEFAULT 'INITIATED',
    "initiated_by" UUID NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."count_lines" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "system_qty" DECIMAL(10,2) NOT NULL,
    "physical_qty" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "system_ma" DECIMAL(10,2) NOT NULL,
    "is_frozen" BOOLEAN NOT NULL DEFAULT true,
    "reason_code" TEXT,
    "tx_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."transfer_orders" (
    "id" UUID NOT NULL,
    "source_warehouse_id" UUID NOT NULL,
    "dest_warehouse_id" UUID NOT NULL,
    "status" "warehouse"."TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "initiated_by" UUID NOT NULL,
    "posted_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "tx_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."write_off_requests" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "total_loss" DECIMAL(10,2) NOT NULL,
    "salvage_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" "warehouse"."WriteOffStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "tx_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "write_off_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse"."write_off_evidence" (
    "id" UUID NOT NULL,
    "write_off_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "write_off_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_count_session_warehouse_status" ON "warehouse"."count_sessions"("warehouse_id", "status");

-- CreateIndex
CREATE INDEX "idx_count_session_initiated_at" ON "warehouse"."count_sessions"("initiated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_count_line_session" ON "warehouse"."count_lines"("session_id");

-- CreateIndex
CREATE INDEX "idx_count_line_item_frozen" ON "warehouse"."count_lines"("item_id", "is_frozen");

-- CreateIndex
CREATE INDEX "idx_transfer_source_warehouse" ON "warehouse"."transfer_orders"("source_warehouse_id");

-- CreateIndex
CREATE INDEX "idx_transfer_dest_warehouse" ON "warehouse"."transfer_orders"("dest_warehouse_id");

-- CreateIndex
CREATE INDEX "idx_transfer_status" ON "warehouse"."transfer_orders"("status");

-- CreateIndex
CREATE INDEX "idx_transfer_line_transfer" ON "warehouse"."transfer_lines"("transfer_id");

-- CreateIndex
CREATE INDEX "idx_transfer_line_item" ON "warehouse"."transfer_lines"("item_id");

-- CreateIndex
CREATE INDEX "idx_write_off_warehouse_item" ON "warehouse"."write_off_requests"("warehouse_id", "item_id");

-- CreateIndex
CREATE INDEX "idx_write_off_status" ON "warehouse"."write_off_requests"("status");

-- CreateIndex
CREATE INDEX "idx_write_off_requested_by" ON "warehouse"."write_off_requests"("requested_by");

-- CreateIndex
CREATE INDEX "idx_write_off_evidence_write_off" ON "warehouse"."write_off_evidence"("write_off_id");

-- AddForeignKey
ALTER TABLE "warehouse"."count_lines" ADD CONSTRAINT "count_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "warehouse"."count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "warehouse"."transfer_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse"."write_off_evidence" ADD CONSTRAINT "write_off_evidence_write_off_id_fkey" FOREIGN KEY ("write_off_id") REFERENCES "warehouse"."write_off_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
