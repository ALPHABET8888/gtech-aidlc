import { Injectable } from '@nestjs/common';
import {
  IStockValidationService,
  StockValidationResult,
} from '@autoflow/shared-types';

/**
 * Exception thrown when stock would go negative.
 */
export class StockNegativeException extends Error {
  constructor(
    public readonly itemId: string,
    public readonly warehouseId: string,
    public readonly availableQty: number,
    public readonly requestedQty: number,
  ) {
    super(
      `Insufficient stock for item ${itemId} in warehouse ${warehouseId}. ` +
      `Available: ${availableQty}, Requested: ${requestedQty}`,
    );
    this.name = 'StockNegativeException';
  }
}

/**
 * Exception thrown when stock is frozen (during stock count).
 */
export class StockFrozenException extends Error {
  constructor(
    public readonly itemId: string,
    public readonly warehouseId: string,
  ) {
    super(
      `Stock is frozen for item ${itemId} in warehouse ${warehouseId}. ` +
      `Cannot modify stock during active count session.`,
    );
    this.name = 'StockFrozenException';
  }
}

/**
 * Mock implementation of IStockValidationService.
 * Validates against in-memory stock map and frozen items set.
 */
@Injectable()
export class MockStockValidationService implements IStockValidationService {
  /** Stock balances: key = "itemId:warehouseId", value = qty */
  private readonly stockMap: Map<string, number> = new Map();

  /** Frozen items: key = "itemId:warehouseId" */
  private readonly frozenItems: Set<string> = new Set();

  /**
   * Load stock balances from fixture data.
   */
  loadStock(balances: Array<{ itemId: string; warehouseId: string; qty: number }>): void {
    for (const balance of balances) {
      const key = `${balance.itemId}:${balance.warehouseId}`;
      this.stockMap.set(key, balance.qty);
    }
  }

  /**
   * Validate that sufficient stock exists for a stock-out operation.
   * @throws StockNegativeException if stock would go negative
   */
  async validateStockAvailability(
    itemId: string,
    warehouseId: string,
    requiredQty: number,
  ): Promise<StockValidationResult> {
    const key = `${itemId}:${warehouseId}`;
    const availableQty = this.stockMap.get(key) ?? 0;

    if (availableQty < requiredQty) {
      throw new StockNegativeException(itemId, warehouseId, availableQty, requiredQty);
    }

    return {
      valid: true,
      availableQty,
      requestedQty: requiredQty,
    };
  }

  /**
   * Get current stock balance for an item in a warehouse.
   */
  async getStockBalance(itemId: string, warehouseId: string): Promise<number> {
    const key = `${itemId}:${warehouseId}`;
    return this.stockMap.get(key) ?? 0;
  }

  /**
   * Check if stock is frozen (during stock count) for a warehouse.
   */
  async isStockFrozen(warehouseId: string): Promise<boolean> {
    // Check if any item in this warehouse is frozen
    for (const key of this.frozenItems) {
      if (key.endsWith(`:${warehouseId}`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate that a specific item+warehouse is not frozen.
   * @throws StockFrozenException if item is frozen
   */
  async validateNotFrozen(itemId: string, warehouseId: string): Promise<void> {
    const key = `${itemId}:${warehouseId}`;
    if (this.frozenItems.has(key)) {
      throw new StockFrozenException(itemId, warehouseId);
    }
  }

  /**
   * Freeze an item in a warehouse (during stock count).
   */
  freezeItem(itemId: string, warehouseId: string): void {
    const key = `${itemId}:${warehouseId}`;
    this.frozenItems.add(key);
  }

  /**
   * Unfreeze an item in a warehouse (after stock count completion).
   */
  unfreezeItem(itemId: string, warehouseId: string): void {
    const key = `${itemId}:${warehouseId}`;
    this.frozenItems.delete(key);
  }

  /**
   * Update stock balance (for testing state changes).
   */
  setStock(itemId: string, warehouseId: string, qty: number): void {
    const key = `${itemId}:${warehouseId}`;
    this.stockMap.set(key, qty);
  }

  /**
   * Adjust stock balance by delta.
   */
  adjustStock(itemId: string, warehouseId: string, delta: number): void {
    const key = `${itemId}:${warehouseId}`;
    const current = this.stockMap.get(key) ?? 0;
    this.stockMap.set(key, current + delta);
  }

  /**
   * Clear all stock and frozen state (for testing).
   */
  clear(): void {
    this.stockMap.clear();
    this.frozenItems.clear();
  }
}
