import { Injectable } from '@nestjs/common';
import {
  IMaCalculationService,
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

  async calculateNewMa(
    itemId: string,
    warehouseId: string,
    qty: number,
    value: number,
    isIncrease: boolean,
    _tx?: unknown,
  ): Promise<MaCalculationResult> {
    const key = `${itemId}:${warehouseId}`;
    const currentMa = this.maValues.get(key) ?? this.defaultMa;
    const currentStock = this.stockValues.get(key) ?? this.defaultStock;
    const totalValueBefore = currentStock * currentMa;

    let maAfter: number;
    let stockAfter: number;

    if (isIncrease) {
      stockAfter = currentStock + qty;
      maAfter = stockAfter > 0 ? (totalValueBefore + value) / stockAfter : currentMa;
      maAfter = Math.round(maAfter * 100) / 100;
    } else {
      maAfter = currentMa;
      stockAfter = currentStock - qty;
    }

    return {
      maBefore: currentMa,
      maAfter,
      stockBefore: currentStock,
      stockAfter,
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
