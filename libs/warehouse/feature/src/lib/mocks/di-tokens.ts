/**
 * Dependency Injection tokens for warehouse mock services.
 * These tokens allow swapping mock implementations with real services later.
 */
export const WAREHOUSE_DI_TOKENS = {
  TX_LOG_SERVICE: 'ITxLogService',
  MA_SERVICE: 'IMaCalculationService',
  STOCK_VALIDATION_SERVICE: 'IStockValidationService',
  PERIOD_SERVICE: 'IPeriodService',
  MASTER_DATA_QUERY_SERVICE: 'IMasterDataQueryService',
} as const;
