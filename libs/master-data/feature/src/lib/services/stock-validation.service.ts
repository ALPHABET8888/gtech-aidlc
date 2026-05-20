import { Injectable } from '@nestjs/common';
import { StockBalanceRepository } from '@autoflow/master-data-data-access';
import { StockNegativeException, StockFrozenException } from '@autoflow/shared-errors';
import { IStockValidationService } from '@autoflow/shared-types';

/**
 * StockValidationService — prevents negative stock and blocks movements on frozen stock.
 *
 * Rules:
 * - validateStockAvailable: throws StockNegativeException if stock_before - qty < 0
 * - Checks is_frozen flag: throws StockFrozenException if stock is frozen during count
 * - getStockBalance: returns current qty for an item+warehouse pair
 */
@Injectable()
export class StockValidationService implements IStockValidationService {
  constructor(
    private readonly stockBalanceRepository: StockBalanceRepository,
  ) {}

  /**
   * Validate that sufficient stock is available for a stock-out operation.
   * Also checks if stock is frozen (during stock count).
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @param qty - Quantity to deduct (positive number)
   * @throws StockFrozenException if stock is frozen during count
   * @throws StockNegativeException if stock_before - qty < 0
   */
  async validateStockAvailable(
    itemId: string,
    warehouseId: string,
    qty: number,
  ): Promise<void> {
    const stockBalance = await this.stockBalanceRepository.findByItemWarehouse(
      itemId,
      warehouseId,
    );

    // Check frozen flag first — frozen stock cannot be moved
    if (stockBalance?.isFrozen) {
      throw new StockFrozenException(itemId, warehouseId);
    }

    const currentQty = stockBalance ? Number(stockBalance.qty) : 0;

    // Check if deduction would cause negative stock
    if (currentQty - qty < 0) {
      throw new StockNegativeException(itemId, currentQty, qty);
    }
  }

  /**
   * Get current stock balance quantity for an item in a warehouse.
   * Returns 0 if no stock balance record exists.
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @returns Current stock quantity
   */
  async getStockBalance(itemId: string, warehouseId: string): Promise<number> {
    const stockBalance = await this.stockBalanceRepository.findByItemWarehouse(
      itemId,
      warehouseId,
    );

    return stockBalance ? Number(stockBalance.qty) : 0;
  }
}
