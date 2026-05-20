import { Module } from '@nestjs/common';
import { WarehouseDataAccessModule } from '@autoflow/warehouse-data-access';
import {
  MasterDataModule,
  TxLogService,
  MaCalculationService,
  StockValidationService,
  PeriodService,
} from '@autoflow/master-data-feature';
import { StockCountService } from './services/stock-count.service';
import { StockTransferService } from './services/stock-transfer.service';
import { WriteOffService } from './services/write-off.service';
import { CountSessionController } from './controllers/count-session.controller';
import { TransferController } from './controllers/transfer.controller';
import { WriteOffController } from './controllers/write-off.controller';
import { WarehouseMasterDataController } from './controllers/warehouse-master-data.controller';
import { WAREHOUSE_DI_TOKENS } from './mocks/di-tokens';
import { WarehouseMasterDataQueryAdapter } from './adapters/master-data-query.adapter';

/**
 * WarehouseModule — Warehouse Operations (Stock Count, Transfer, Write-off)
 *
 * This module encapsulates all warehouse adjustment operations:
 * - **Stock Count**: Cycle count sessions with freeze/unfreeze, physical count recording,
 *   approval workflow, and automatic ADJ_COUNT_UP/DOWN TX posting.
 * - **Stock Transfer**: Atomic inter-warehouse transfers with ADJ_TRANSFER TX posting.
 * - **Write-off**: Evidence-based write-off requests with CFO approval and ADJ_WRITEOFF TX posting.
 *
 * ## Dependency Injection Strategy
 *
 * External dependencies (TX Log, MA Calculation, Stock Validation, Period, Master Data)
 * are injected via DI tokens defined in `WAREHOUSE_DI_TOKENS`. Wired to real services
 * from MasterDataModule via `useExisting` bindings.
 *
 * ## OpenAPI Tags
 * - `warehouse / stock-count` — Count session lifecycle endpoints
 * - `warehouse / stock-transfer` — Transfer order endpoints
 * - `warehouse / write-off` — Write-off request and evidence endpoints
 *
 * @see design.md — Architecture section for full module diagram
 */
@Module({
  imports: [WarehouseDataAccessModule, MasterDataModule],
  controllers: [CountSessionController, TransferController, WriteOffController, WarehouseMasterDataController],
  providers: [
    // Domain services
    StockCountService,
    StockTransferService,
    WriteOffService,

    // Real service providers via DI tokens
    {
      provide: WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE,
      useExisting: TxLogService,
    },
    {
      provide: WAREHOUSE_DI_TOKENS.MA_SERVICE,
      useExisting: MaCalculationService,
    },
    {
      provide: WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE,
      useExisting: StockValidationService,
    },
    {
      provide: WAREHOUSE_DI_TOKENS.PERIOD_SERVICE,
      useExisting: PeriodService,
    },
    {
      provide: WAREHOUSE_DI_TOKENS.MASTER_DATA_QUERY_SERVICE,
      useClass: WarehouseMasterDataQueryAdapter,
    },
    // Adapter for master data queries
    WarehouseMasterDataQueryAdapter,
  ],
  exports: [
    StockCountService,
    StockTransferService,
    WriteOffService,
    WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE,
    WAREHOUSE_DI_TOKENS.MA_SERVICE,
    WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE,
    WAREHOUSE_DI_TOKENS.PERIOD_SERVICE,
    WAREHOUSE_DI_TOKENS.MASTER_DATA_QUERY_SERVICE,
  ],
})
export class WarehouseModule {}
