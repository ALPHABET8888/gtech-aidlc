export { MasterDataModule } from './lib/master-data.module';
export { PeriodService } from './lib/services/period.service';
export { TxLogService } from './lib/services/tx-log.service';
export { MaCalculationService } from './lib/services/ma-calculation.service';
export type { MaResult } from './lib/services/ma-calculation.service';
export { StockValidationService } from './lib/services/stock-validation.service';
export { VoidService } from './lib/services/void.service';
export { RefChainValidatorService } from './lib/services/ref-chain-validator.service';
export type { RefChainRule, RefField, RefChainViolation } from './lib/services/ref-chain-validator.service';
export { ApprovalService } from './lib/services/approval.service';
export { ItemService } from './lib/services/item.service';
export { WarehouseService } from './lib/services/warehouse.service';
export { VendorService } from './lib/services/vendor.service';
export { CustomerService } from './lib/services/customer.service';
export { ApprovalGuard } from './lib/guards/approval.guard';
export { RequiresApproval, REQUIRES_APPROVAL_KEY } from './lib/decorators/requires-approval.decorator';
export { StockBalanceService } from './lib/services/stock-balance.service';
export { CreateTxDto } from './lib/dto/create-tx.dto';
export { VoidTxDto } from './lib/dto/void-tx.dto';
export { CreateItemDto } from './lib/dto/create-item.dto';
export { UpdateItemDto } from './lib/dto/update-item.dto';
export { CreateWarehouseDto } from './lib/dto/create-warehouse.dto';
export { UpdateWarehouseDto } from './lib/dto/update-warehouse.dto';
export { CreateVendorDto } from './lib/dto/create-vendor.dto';
export { UpdateVendorDto } from './lib/dto/update-vendor.dto';
export { CreateCustomerDto } from './lib/dto/create-customer.dto';
export { UpdateCustomerDto } from './lib/dto/update-customer.dto';

// Mocks — for downstream unit testing
export {
  MockTxLogService,
  MockMaCalculationService,
  MockStockValidationService,
  MockPeriodService,
  MockRefChainService,
} from './lib/__mocks__';
