import { Module } from '@nestjs/common';
import { CountSessionRepository } from './count-session.repository';
import { TransferOrderRepository } from './transfer-order.repository';
import { WriteOffRepository } from './write-off.repository';

@Module({
  providers: [CountSessionRepository, TransferOrderRepository, WriteOffRepository],
  exports: [CountSessionRepository, TransferOrderRepository, WriteOffRepository],
})
export class WarehouseDataAccessModule {}
