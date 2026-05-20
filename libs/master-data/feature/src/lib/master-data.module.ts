import { Module } from '@nestjs/common';
import { MasterDataDataAccessModule } from '@autoflow/master-data-data-access';
import { PeriodService } from './services/period.service';
import { TxLogService } from './services/tx-log.service';
import { MaCalculationService } from './services/ma-calculation.service';
import { StockValidationService } from './services/stock-validation.service';
import { VoidService } from './services/void.service';
import { RefChainValidatorService } from './services/ref-chain-validator.service';
import { ApprovalService } from './services/approval.service';
import { ItemService } from './services/item.service';
import { WarehouseService } from './services/warehouse.service';
import { VendorService } from './services/vendor.service';
import { CustomerService } from './services/customer.service';
import { UserService } from './services/user.service';
import { StockBalanceService } from './services/stock-balance.service';
import { ApprovalGuard } from './guards/approval.guard';
import { PeriodController } from './controllers/period.controller';
import { TxController } from './controllers/tx.controller';
import { ItemController } from './controllers/item.controller';
import { WarehouseController } from './controllers/warehouse.controller';
import { VendorController } from './controllers/vendor.controller';
import { CustomerController } from './controllers/customer.controller';
import { UserController } from './controllers/user.controller';
import { StockBalanceController } from './controllers/stock-balance.controller';

@Module({
  imports: [MasterDataDataAccessModule],
  controllers: [PeriodController, TxController, ItemController, WarehouseController, VendorController, CustomerController, UserController, StockBalanceController],
  providers: [PeriodService, TxLogService, MaCalculationService, StockValidationService, VoidService, RefChainValidatorService, ApprovalService, ItemService, WarehouseService, VendorService, CustomerService, UserService, StockBalanceService, ApprovalGuard],
  exports: [PeriodService, TxLogService, MaCalculationService, StockValidationService, VoidService, RefChainValidatorService, ApprovalService, ItemService, WarehouseService, VendorService, CustomerService, UserService, StockBalanceService, ApprovalGuard],
})
export class MasterDataModule {}
