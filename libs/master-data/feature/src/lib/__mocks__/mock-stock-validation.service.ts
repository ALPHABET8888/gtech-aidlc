import type { IStockValidationService } from '@autoflow/shared-types';

/**
 * Mock Stock Validation Service for downstream unit testing.
 * Always validates stock as sufficient (no exceptions thrown).
 * Returns realistic stock quantities matching seed data values.
 */
export class MockStockValidationService implements IStockValidationService {
  /** Simulated stock balances per item+warehouse */
  private readonly stockBalances: Record<string, number> = {
    'item-001-sku-a100:wh-001-main': 150,
    'item-002-sku-b200:wh-001-main': 80,
    'item-003-sku-c300:wh-002-branch': 35,
    'item-004-sku-d400:wh-001-main': 200,
    'item-005-sku-e500:wh-003-online': 60,
  };

  /**
   * Always resolves successfully — stock is sufficient.
   * In production, this would throw StockNegativeException or StockFrozenException.
   */
  async validateStockAvailable(
    _itemId: string,
    _warehouseId: string,
    _qty: number,
  ): Promise<void> {
    // No-op: always resolves (stock sufficient for testing)
    return;
  }

  /**
   * Returns realistic stock quantity for the given item+warehouse.
   * Falls back to 100 units if the combination is not in sample data.
   */
  async getStockBalance(
    itemId: string,
    warehouseId: string,
  ): Promise<number> {
    const key = `${itemId}:${warehouseId}`;
    return this.stockBalances[key] ?? 100;
  }
}
