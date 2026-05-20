import { Module } from '@nestjs/common';
import { MockTxLogService } from './mock-tx-log.service';
import { MockMaCalculationService } from './mock-ma-calculation.service';
import { MockStockValidationService } from './mock-stock-validation.service';
import { MockPeriodService } from './mock-period.service';
import { MockRefChainService } from './mock-ref-chain.service';
import { MockMasterDataLookupService } from './mock-master-data-lookup.service';

/**
 * MasterDataMockModule — provides mock implementations of Master Data services.
 * Uses DI tokens matching shared interfaces so services can be swapped to real
 * implementations later by replacing this module import with MasterDataModule.
 *
 * ## Usage
 * Import this module in TransactionsModule during development:
 * ```typescript
 * @Module({ imports: [MasterDataMockModule, ...] })
 * export class TransactionsModule {}
 * ```
 *
 * ## Swap to Real
 * When the real Master Data module is ready, replace:
 * ```typescript
 * imports: [MasterDataModule, ...]  // ← swap MasterDataMockModule → MasterDataModule
 * ```
 *
 * See design/integration.md for full interface contracts.
 */
@Module({
  providers: [
    { provide: 'ITxLogService', useClass: MockTxLogService },
    { provide: 'IMaCalculationService', useClass: MockMaCalculationService },
    { provide: 'IStockValidationService', useClass: MockStockValidationService },
    { provide: 'IPeriodService', useClass: MockPeriodService },
    { provide: 'IRefChainService', useClass: MockRefChainService },
    { provide: 'IMasterDataLookupService', useClass: MockMasterDataLookupService },
  ],
  exports: [
    'ITxLogService',
    'IMaCalculationService',
    'IStockValidationService',
    'IPeriodService',
    'IRefChainService',
    'IMasterDataLookupService',
  ],
})
export class MasterDataMockModule {}
