/**
 * Mock implementations for downstream unit testing.
 *
 * Usage:
 *   import { MockTxLogService, MockMaCalculationService } from '@autoflow/master-data/feature/mocks';
 *
 * These mocks implement the shared-types interfaces and return realistic sample data.
 * Use them in unit tests to avoid depending on the full master-data module.
 */

export { MockTxLogService } from './mock-tx-log.service';
export { MockMaCalculationService } from './mock-ma-calculation.service';
export { MockStockValidationService } from './mock-stock-validation.service';
export { MockPeriodService } from './mock-period.service';
export { MockRefChainService } from './mock-ref-chain.service';
