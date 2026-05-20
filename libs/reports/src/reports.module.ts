import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoflow/shared-prisma';
import {
  MasterDataModule,
  StockValidationService,
  PeriodService,
} from '@autoflow/master-data-feature';
import { ReportsTxLogAdapter } from './adapters/reports-tx-log.adapter';
import {
  TX_LOG_SERVICE,
  STOCK_VALIDATION_SERVICE,
  PERIOD_SERVICE,
} from './di-tokens';
import { AlertRuleService } from './alerts/alert-rule.service';
import { AlertLogService } from './alerts/alert-log.service';
import { AlertsController } from './alerts/alerts.controller';
import { AlertValidationGuard } from './alerts/alert-validation.guard';
import { ReportQueryService } from './reports/report-query.service';
import { ReportsController } from './reports/reports.controller';

@Module({
  imports: [PrismaModule, MasterDataModule],
  controllers: [AlertsController, ReportsController],
  providers: [
    {
      provide: TX_LOG_SERVICE,
      useClass: ReportsTxLogAdapter,
    },
    {
      provide: STOCK_VALIDATION_SERVICE,
      useExisting: StockValidationService,
    },
    {
      provide: PERIOD_SERVICE,
      useExisting: PeriodService,
    },
    ReportsTxLogAdapter,
    AlertRuleService,
    AlertLogService,
    AlertValidationGuard,
    ReportQueryService,
  ],
  exports: [
    TX_LOG_SERVICE,
    STOCK_VALIDATION_SERVICE,
    PERIOD_SERVICE,
    AlertRuleService,
    AlertLogService,
    AlertValidationGuard,
    ReportQueryService,
  ],
})
export class ReportsModule {}
