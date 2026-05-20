import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { IStockValidationService, StockValidationResult } from '@autoflow/shared-types';

/**
 * Mock implementation of IStockValidationService.
 * Configurable to pass or throw StockNegativeException.
 * Default behavior: passes all validations with stock = 1000.
 */
@Injectable()
export class MockStockValidationService implements IStockValidationService {
  /** Items configured to fail validation. Key: `${itemId}:${warehouseId}` */
  private failingItems: Set<string> = new Set();

  /** Configurable stock balances. Key: `${itemId}:${warehouseId}` */
  private stockBalances: Map<string, number> = new Map();

  /** Frozen warehouses */
  private frozenWarehouses: Set<string> = new Set();

  /** Default stock balance when not configured */
  private defaultBalance = 1000;

  /**
   * Configure an item+warehouse to fail stock validation.
   */
  setFailing(itemId: string, warehouseId: string): void {
    this.failingItems.add(`${itemId}:${warehouseId}`);
  }

  /**
   * Configure an item+warehouse to pass stock validation.
   */
  setPassing(itemId: string, warehouseId: string): void {
    this.failingItems.delete(`${itemId}:${warehouseId}`);
  }

  /**
   * Set stock balance for a specific item+warehouse.
   */
  setStockBalance(itemId: string, warehouseId: string, balance: number): void {
    this.stockBalances.set(`${itemId}:${warehouseId}`, balance);
  }

  /**
   * Set a warehouse as frozen (stock count in progress).
   */
  setFrozen(warehouseId: string, frozen: boolean): void {
    if (frozen) {
      this.frozenWarehouses.add(warehouseId);
    } else {
      this.frozenWarehouses.delete(warehouseId);
    }
  }

  /**
   * Set the default stock balance for unconfigured items.
   */
  setDefaultBalance(balance: number): void {
    this.defaultBalance = balance;
  }

  async validateStockAvailability(
    itemId: string,
    warehouseId: string,
    requiredQty: number,
  ): Promise<StockValidationResult> {
    const key = `${itemId}:${warehouseId}`;

    if (this.failingItems.has(key)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'STOCK_NEGATIVE',
          message: `Insufficient stock for item ${itemId} in warehouse ${warehouseId}. Required: ${requiredQty}, Available: 0`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const available = this.stockBalances.get(key) ?? this.defaultBalance;

    if (available < requiredQty) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'STOCK_NEGATIVE',
          message: `Insufficient stock for item ${itemId} in warehouse ${warehouseId}. Required: ${requiredQty}, Available: ${available}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return {
      valid: true,
      availableQty: available,
      requestedQty: requiredQty,
    };
  }

  async getStockBalance(itemId: string, warehouseId: string): Promise<number> {
    const key = `${itemId}:${warehouseId}`;
    return this.stockBalances.get(key) ?? this.defaultBalance;
  }

  async isStockFrozen(warehouseId: string): Promise<boolean> {
    return this.frozenWarehouses.has(warehouseId);
  }

  /**
   * Reset all configured values — useful for testing.
   */
  reset(): void {
    this.failingItems.clear();
    this.stockBalances.clear();
    this.frozenWarehouses.clear();
    this.defaultBalance = 1000;
  }
}
