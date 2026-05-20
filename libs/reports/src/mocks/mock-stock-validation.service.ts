import { Injectable } from '@nestjs/common';
import { IStockValidationService } from '@autoflow/shared-types';
import { MOCK_STOCK_BALANCES } from './mock-data';

/**
 * Mock implementation of IStockValidationService for the Reports module.
 * Validates stock availability using mock stock balance data.
 * Will be replaced with real service when Warehouse unit is integrated.
 */
@Injectable()
export class MockStockValidationService implements IStockValidationService {
  async validateStockAvailable(
    itemId: string,
    warehouseId: string,
    qty: number,
  ): Promise<void> {
    const balance = MOCK_STOCK_BALANCES.find(
      (b) => b.itemId === itemId && b.warehouseId === warehouseId,
    );

    const availableQty = balance?.currentQty ?? 0;

    if (availableQty < qty) {
      throw new Error(
        `สต็อกไม่เพียงพอ: มี ${availableQty} ต้องการ ${qty}`,
      );
    }
  }

  async getStockBalance(itemId: string, warehouseId: string): Promise<number> {
    const balance = MOCK_STOCK_BALANCES.find(
      (b) => b.itemId === itemId && b.warehouseId === warehouseId,
    );
    return balance?.currentQty ?? 0;
  }
}
