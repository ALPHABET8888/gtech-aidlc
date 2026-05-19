import { Injectable } from '@nestjs/common';
import {
  IMaCalculationService,
  MaCalculationInput,
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
   * Calculate new MA for a stock-in transaction.
   * Formula: newMA = (currentQty * currentMA + incomingQty * incomingCost) / (currentQty + incomingQty)
   */
  calculateMa(input: MaCalculationInput): MaCalculationResult {
    const { currentQty, currentMa, qtyChange, unitCost } = input;
    const totalValueBefore = currentQty * currentMa;
    const incomingValue = qtyChange * unitCost;
    const newQty = currentQty + qtyChange;

    const maAfter = newQty > 0
      ? Math.round(((totalValueBefore + incomingValue) / newQty) * 100) / 100
      : 0;

    return {
      maBefore: currentMa,
      maAfter,
      stockBefore: currentQty,
      stockAfter: newQty,
      totalValueAfter: Math.round(newQty * maAfter * 100) / 100,
    };
  }

  /**
   * Calculate stock-out impact (uses current MA, no recalculation).
   */
  calculateStockOut(currentQty: number, currentMa: number, outQty: number): MaCalculationResult {
    const newQty = currentQty - outQty;
    return {
      maBefore: currentMa,
      maAfter: currentMa, // MA unchanged on stock-out
      stockBefore: currentQty,
      stockAfter: newQty,
      totalValueAfter: Math.round(newQty * currentMa * 100) / 100,
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
