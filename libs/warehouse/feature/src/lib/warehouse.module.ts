import { Module } from '@nestjs/common';
import { WarehouseDataAccessModule } from '@autoflow/warehouse-data-access';
import { StockCountService } from './services/stock-count.service';
import { StockTransferService } from './services/stock-transfer.service';
import { WriteOffService } from './services/write-off.service';
import { CountSessionController } from './controllers/count-session.controller';
import { TransferController } from './controllers/transfer.controller';
import { WriteOffController } from './controllers/write-off.controller';
import { MockTxLogService } from './mocks/mock-tx-log.service';
import { MockMaService } from './mocks/mock-ma.service';
import { MockStockValidationService } from './mocks/mock-stock-validation.service';
import { MockPeriodService } from './mocks/mock-period.service';
import { WAREHOUSE_DI_TOKENS } from './mocks/di-tokens';

@Module({
  imports: [WarehouseDataAccessModule],
  controllers: [CountSessionController, TransferController, WriteOffController],
  providers: [
    StockCountService,
    StockTransferService,
    WriteOffService,
    { provide: WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE, useClass: MockTxLogService },
    { provide: WAREHOUSE_DI_TOKENS.MA_SERVICE, useClass: MockMaService },
    { provide: WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE, useClass: MockStockValidationService },
    { provide: WAREHOUSE_DI_TOKENS.PERIOD_SERVICE, useClass: MockPeriodService },
  ],
  exports: [StockCountService, StockTransferService, WriteOffService],
})
export class WarehouseModule {}
