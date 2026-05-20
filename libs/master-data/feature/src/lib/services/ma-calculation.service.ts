import { Injectable } from '@nestjs/common';
import { Prisma, StockBalance } from '@prisma/client';
import { StockBalanceRepository } from '@autoflow/master-data-data-access';
import { IMaCalculationService, MaCalculationResult } from '@autoflow/shared-types';

/**
 * Result of an MA calculation operation.
 * Contains before/after snapshots of both MA and stock quantity.
 */
export interface MaResult {
  maBefore: number;
  maAfter: number;
  stockBefore: number;
  stockAfter: number;
}

/**
 * MaCalculationService — calculates Moving Average atomically for stock-affecting transactions.
 *
 * Rules:
 * - Stock increase: newMA = (existingTotalValue + incomingValue) / (existingQty + incomingQty)
 * - Stock decrease: MA unchanged, use current MA for cost calculation
 * - Row lock (SELECT FOR UPDATE) ensures no concurrent MA recalculation
 * - Never recalculates retroactively
 */
@Injectable()
export class MaCalculationService implements IMaCalculationService {
  constructor(
    private readonly stockBalanceRepository: StockBalanceRepository,
  ) {}

  /**
   * Calculate new Moving Average and update stock balance atomically.
   * Must be called within a Prisma interactive transaction to hold the row lock.
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @param qty - Quantity of the transaction (always positive)
   * @param value - Total value of the incoming/outgoing goods (always positive)
   * @param isIncrease - true for stock-increasing TX, false for stock-decreasing TX
   * @param tx - Prisma transaction client (required for row locking)
   * @returns MaResult with before/after snapshots
   */
  async calculateNewMa(
    itemId: string,
    warehouseId: string,
    qty: number,
    value: number,
    isIncrease: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<MaResult> {
    // Acquire row lock on stock_balance
    const stockBalance = await this.stockBalanceRepository.findByItemWarehouseForUpdate(
      itemId,
      warehouseId,
      tx,
    );

    const existingQty = stockBalance ? Number(stockBalance.qty) : 0;
    const existingTotalValue = stockBalance ? Number(stockBalance.totalValue) : 0;
    const existingMa = stockBalance ? Number(stockBalance.ma) : 0;

    let newMa: number;
    let newQty: number;
    let newTotalValue: number;

    if (isIncrease) {
      // Stock increase: recalculate MA
      newQty = existingQty + qty;
      newTotalValue = existingTotalValue + value;

      // Edge case: if newQty is 0 (shouldn't happen for increase, but guard against it)
      newMa = newQty > 0 ? newTotalValue / newQty : 0;
    } else {
      // Stock decrease: MA unchanged, deduct stock at current MA
      newMa = existingMa;
      newQty = existingQty - qty;
      newTotalValue = newMa * newQty;
    }

    // Update stock_balance with new values
    await this.stockBalanceRepository.upsert(
      {
        itemId,
        warehouseId,
        qty: newQty,
        totalValue: newTotalValue,
        ma: newMa,
      },
      tx,
    );

    return {
      maBefore: existingMa,
      maAfter: newMa,
      stockBefore: existingQty,
      stockAfter: newQty,
    };
  }

  /**
   * Get current Moving Average for an item at a specific warehouse.
   * Read-only — no locking required.
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @returns Current MA value, or 0 if no stock balance exists
   */
  async getCurrentMa(itemId: string, warehouseId: string): Promise<number> {
    const stockBalance = await this.stockBalanceRepository.findByItemWarehouse(
      itemId,
      warehouseId,
    );

    return stockBalance ? Number(stockBalance.ma) : 0;
  }
}
