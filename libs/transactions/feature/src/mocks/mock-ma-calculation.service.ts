import { Injectable } from '@nestjs/common';
import {
  IMaCalculationService,
  MaCalculationInput,
  MaCalculationResult,
} from '@autoflow/shared-types';

/**
 * Mock implementation of IMaCalculationService.
 * Returns configurable MA values. Default MA = 100.00 THB.
 * Used during development until real Master Data module is available.
 */
@Injectable()
export class MockMaCalculationService implements IMaCalculationService {
  /** Configurable default MA per item+warehouse. Key: `${itemId}:${warehouseId}` */
  private maValues: Map<string, number> = new Map();

  /** Configurable default stock per item+warehouse. Key: `${itemId}:${warehouseId}` */
  private stockValues: Map<string, number> = new Map();

  /** Default MA value when not configured */
  private defaultMa = 100.0;

  /** Default stock quantity when not configured */
  private defaultStock = 1000;

  /**
   * Configure MA value for a specific item+warehouse combination.
   */
  setMa(itemId: string, warehouseId: string, ma: number): void {
    this.maValues.set(`${itemId}:${warehouseId}`, ma);
  }

  /**
   * Configure stock value for a specific item+warehouse combination.
   */
  setStock(itemId: string, warehouseId: string, stock: number): void {
    this.stockValues.set(`${itemId}:${warehouseId}`, stock);
  }

  /**
   * Set the default MA value for unconfigured items.
   */
  setDefaultMa(ma: number): void {
    this.defaultMa = ma;
  }

  /**
   * Set the default stock value for unconfigured items.
   */
  setDefaultStock(stock: number): void {
    this.defaultStock = stock;
  }

  calculateMa(input: MaCalculationInput): MaCalculationResult {
    const { currentQty, currentMa, qtyChange, unitCost } = input;
    const totalValueBefore = currentQty * currentMa;
    const incomingValue = qtyChange * unitCost;
    const newQty = currentQty + qtyChange;
    const newMa = newQty > 0 ? (totalValueBefore + incomingValue) / newQty : currentMa;

    return {
      maBefore: currentMa,
      maAfter: Math.round(newMa * 100) / 100,
      stockBefore: currentQty,
      stockAfter: newQty,
      totalValueAfter: Math.round(newQty * newMa * 100) / 100,
    };
  }

  calculateStockOut(currentQty: number, currentMa: number, outQty: number): MaCalculationResult {
    return {
      maBefore: currentMa,
      maAfter: currentMa, // MA doesn't change on stock-out
      stockBefore: currentQty,
      stockAfter: currentQty - outQty,
      totalValueAfter: Math.round((currentQty - outQty) * currentMa * 100) / 100,
    };
  }

  async getCurrentMa(itemId: string, warehouseId: string): Promise<number> {
    const key = `${itemId}:${warehouseId}`;
    return this.maValues.get(key) ?? this.defaultMa;
  }

  /**
   * Reset all configured values — useful for testing.
   */
  reset(): void {
    this.maValues.clear();
    this.stockValues.clear();
    this.defaultMa = 100.0;
    this.defaultStock = 1000;
  }
}
