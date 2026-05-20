import type { IMaCalculationService, MaCalculationResult } from '@autoflow/shared-types';

/**
 * Mock MA Calculation Service for downstream unit testing.
 * Simulates proper Moving Average calculation logic with realistic sample values.
 *
 * MA formula (stock-in): newMa = (existingTotalValue + incomingValue) / (existingQty + incomingQty)
 * MA formula (stock-out): MA unchanged — uses current MA for COGS
 */
export class MockMaCalculationService implements IMaCalculationService {
  /** Simulated current MA per item+warehouse (THB) */
  private readonly stockState: Record<
    string,
    { qty: number; ma: number }
  > = {
    'item-001-sku-a100:wh-001-main': { qty: 150, ma: 82.75 },
    'item-002-sku-b200:wh-001-main': { qty: 80, ma: 45.0 },
    'item-003-sku-c300:wh-002-branch': { qty: 35, ma: 116.43 },
  };

  async calculateNewMa(
    itemId: string,
    warehouseId: string,
    qty: number,
    value: number,
    isIncrease: boolean,
    _tx?: unknown,
  ): Promise<MaCalculationResult> {
    const key = `${itemId}:${warehouseId}`;
    const state = this.stockState[key] ?? { qty: 50, ma: 100.0 };

    const maBefore = state.ma;
    const stockBefore = state.qty;

    let maAfter: number;
    let stockAfter: number;

    if (isIncrease) {
      // MA recalculates on stock-in
      const existingTotal = stockBefore * maBefore;
      stockAfter = stockBefore + qty;
      maAfter =
        stockAfter > 0
          ? Number(((existingTotal + value) / stockAfter).toFixed(2))
          : 0;
    } else {
      // MA unchanged on stock-out
      maAfter = maBefore;
      stockAfter = stockBefore - qty;
    }

    return {
      maBefore,
      maAfter,
      stockBefore,
      stockAfter,
    };
  }

  async getCurrentMa(
    itemId: string,
    warehouseId: string,
  ): Promise<number> {
    const key = `${itemId}:${warehouseId}`;
    const state = this.stockState[key];
    return state?.ma ?? 0;
  }
}
