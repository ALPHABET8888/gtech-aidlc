import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoflow/shared-prisma';
import { TxLogRepository } from './repositories/tx-log.repository';
import { StockBalanceRepository } from './repositories/stock-balance.repository';
import { PeriodRepository } from './repositories/period.repository';
import { ItemRepository } from './repositories/item.repository';
import { WarehouseRepository } from './repositories/warehouse.repository';
import { VendorRepository } from './repositories/vendor.repository';
import { CustomerRepository } from './repositories/customer.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  imports: [PrismaModule],
  providers: [TxLogRepository, StockBalanceRepository, PeriodRepository, ItemRepository, WarehouseRepository, VendorRepository, CustomerRepository, UserRepository],
  exports: [TxLogRepository, StockBalanceRepository, PeriodRepository, ItemRepository, WarehouseRepository, VendorRepository, CustomerRepository, UserRepository],
})
export class MasterDataDataAccessModule {}
