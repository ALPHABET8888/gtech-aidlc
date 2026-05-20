export { ReportsModule } from './reports.module';

// Alert Services
export { AlertLogService } from './alerts/alert-log.service';
export { AlertRuleService } from './alerts/alert-rule.service';

// Alert Guard & Decorator
export { AlertValidationGuard } from './alerts/alert-validation.guard';
export { ValidateAlerts } from './alerts/validate-alerts.decorator';

// Alert DTOs
export type { AlertValidationResult, AlertError } from './alerts/dto';
export type { CreateAlertLogDto } from './alerts/dto';
export { AlertQueryFilterDto } from './alerts/dto';

// Report DTOs
export type {
  StockBalanceView,
  StockBalanceResponse,
  StockBalanceSummary,
  PaginationMeta,
} from './reports/dto';
export type { APAgingView, APAgingResponse, APAgingSummary } from './reports/dto';
export type { ARAgingView, ARAgingResponse, ARAgingSummary } from './reports/dto';
export type { DashboardResponse, RecentAlert } from './reports/dto';
export { ReportFilterDto } from './reports/dto';

// Report Services
export { ReportQueryService } from './reports/report-query.service';

// DI Tokens
export {
  TX_LOG_SERVICE,
  STOCK_VALIDATION_SERVICE,
  PERIOD_SERVICE,
} from './di-tokens';

// Adapters
export { ReportsTxLogAdapter } from './adapters/reports-tx-log.adapter';
