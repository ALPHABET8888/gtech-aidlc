import { Injectable, NotFoundException } from '@nestjs/common';
import { StockBalance } from '@prisma/client';
import { StockBalanceRepository, PaginatedResult } from '@autoflow/master-data-data-access';

export interface StockBalanceFilters {
  itemId?: string;
  warehouseId?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Service handling Stock Balance query operations.
 * Stock balances are read-only from this service — they are updated
 * by the TX Engine (MaCalculationService) during transaction processing.
 */
@Injectable()
export class StockBalanceService {
  constructor(private readonly stockBalanceRepository: StockBalanceRepository) {}

  /**
   * List stock balances with optional filtering and pagination.
   */
  async findAll(
    filters: StockBalanceFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<StockBalance>> {
    return this.stockBalanceRepository.findMany(filters, pagination);
  }

  /**
   * Get a specific stock balance for an item+warehouse pair.
   * @throws NotFoundException if no stock balance exists for the pair.
   */
  async findByItemAndWarehouse(itemId: string, warehouseId: string): Promise<StockBalance> {
    const balance = await this.stockBalanceRepository.findByItemWarehouse(itemId, warehouseId);
    if (!balance) {
      throw new NotFoundException(
        `Stock balance not found for item '${itemId}' in warehouse '${warehouseId}'`,
      );
    }
    return balance;
  }
}
