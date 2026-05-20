import { Injectable } from '@nestjs/common';
import {
  IMaCalculationService,
  MaCalculationResult,
} from '@autoflow/shared-types';

/**
 * Stock balance entry used by MockMaService.
 */
export interface StockBalanceEntry {
  itemId: string;
  warehouseId: string;
  qty: number;
  ma: number;
}

/**
 * Mock implementation of IMaCalculationService.
 * Uses configurable stock balances from fixtures for MA lookups.
 * Performs real MA calculations using the standard formula.
 */
@Injectable()
export class MockMaService implements IMaCalculationService {
  private readonly stockBalances: Map<string, StockBalanceEntry> = new Map();

  /**
   * Load stock balances from fixture data.
   */
  loadBalances(balances: StockBalanceEntry[]): void {
    for (const balance of balances) {
      const key = `${balance.itemId}:${balance.warehouseId}`;
      this.stockBalances.set(key, { ...balance });
    }
  }

  /**
   * Calculate new MA and update stock balance atomically.
   */
  async calculateNewMa(
    itemId: string,
    warehouseId: string,
    qty: number,
    value: number,
    isIncrease: boolean,
    _tx?: unknown,
  ): Promise<MaCalculationResult> {
    const key = `${itemId}:${warehouseId}`;
    const balance = this.stockBalances.get(key) ?? { itemId, warehouseId, qty: 0, ma: 0 };

    const currentQty = balance.qty;
    const currentMa = balance.ma;
    const totalValueBefore = currentQty * currentMa;

    let maAfter: number;
    let stockAfter: number;

    if (isIncrease) {
      stockAfter = currentQty + qty;
      maAfter = stockAfter > 0
        ? Math.round(((totalValueBefore + value) / stockAfter) * 100) / 100
        : 0;
    } else {
      maAfter = currentMa; // MA unchanged on stock-out
      stockAfter = currentQty - qty;
    }

    // Update internal state
    this.stockBalances.set(key, { itemId, warehouseId, qty: stockAfter, ma: maAfter });

    return {
      maBefore: currentMa,
      maAfter,
      stockBefore: currentQty,
      stockAfter,
    };
  }

  /**
   * Get current MA for an item in a warehouse.
   */
  async getCurrentMa(itemId: string, warehouseId: string): Promise<number> {
    const key = `${itemId}:${warehouseId}`;
    const balance = this.stockBalances.get(key);
    return balance?.ma ?? 0;
  }

  /**
   * Update the internal stock balance (for testing state changes).
   */
  updateBalance(itemId: string, warehouseId: string, qty: number, ma: number): void {
    const key = `${itemId}:${warehouseId}`;
    this.stockBalances.set(key, { itemId, warehouseId, qty, ma });
  }

  /**
   * Get current stock quantity for an item in a warehouse.
   */
  getStockQty(itemId: string, warehouseId: string): number {
    const key = `${itemId}:${warehouseId}`;
    return this.stockBalances.get(key)?.qty ?? 0;
  }

  /**
   * Clear all balances (for testing).
   */
  clear(): void {
    this.stockBalances.clear();
  }
}
