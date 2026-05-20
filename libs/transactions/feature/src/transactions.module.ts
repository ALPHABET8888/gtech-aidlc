import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoflow/shared-prisma';
import { AuthModule } from '@autoflow/shared-auth';
import {
  JobOrderRepository,
  ApOpenItemRepository,
  ArOpenItemRepository,
  GrIrClearingRepository,
} from '@autoflow/transactions-data-access';
import { MasterDataMockModule } from './mocks/master-data-mock.module';
import { JobOrderService } from './sales/job-order.service';
import { InvoiceService } from './sales/invoice.service';
import { SalesController } from './sales/sales.controller';
import { SalesCnService } from './sales/sales-cn.service';
import { SalesCnController } from './sales/sales-cn.controller';
import { ApService } from './ap-ar/ap.service';
import { ArService } from './ap-ar/ar.service';
import { PaymentMatchingService } from './ap-ar/payment-matching.service';
import { ApArController } from './ap-ar/ap-ar.controller';
import { GoodsReceiptService } from './purchasing/goods-receipt.service';
import { GrIrClearingService } from './purchasing/gr-ir-clearing.service';
import { PurchaseCnService } from './purchasing/purchase-cn.service';
import { PurchasingController } from './purchasing/purchasing.controller';

@Module({
  imports: [
    MasterDataMockModule, // ← swap to real MasterDataModule when ready
    AuthModule,
    PrismaModule,
  ],
  controllers: [SalesController, SalesCnController, PurchasingController, ApArController],
  providers: [
    // Repositories
    JobOrderRepository,
    ApOpenItemRepository,
    ArOpenItemRepository,
    GrIrClearingRepository,
    // Sales services
    JobOrderService,
    InvoiceService,
    SalesCnService,
    // AP/AR services
    ApService,
    ArService,
    PaymentMatchingService,
    // Purchasing services
    GoodsReceiptService,
    GrIrClearingService,
    PurchaseCnService,
  ],
  exports: [JobOrderService, InvoiceService, SalesCnService, ApService, ArService, PaymentMatchingService, GoodsReceiptService, GrIrClearingService, PurchaseCnService],
})
export class TransactionsModule {}
