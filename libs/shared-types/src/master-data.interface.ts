/**
 * Master Data service interfaces — convenience re-exports for downstream units.
 *
 * All downstream units (transactions, warehouse, reports) should import from here
 * or from the main @autoflow/shared-types barrel.
 */

export type { ITxLogService, TxLogEntry } from './interfaces/tx-log-service.interface';
export type {
  IMaCalculationService,
  MaCalculationInput,
  MaCalculationResult,
} from './interfaces/ma-calculation-service.interface';
export type {
  IStockValidationService,
  StockValidationResult,
} from './interfaces/stock-validation-service.interface';
export type { IPeriodService, PeriodInfo } from './interfaces/period-service.interface';
export { PeriodStatus } from './interfaces/period-service.interface';
export type {
  IRefChainService,
  RefField,
  RefChainViolation,
} from './interfaces/ref-chain-service.interface';
