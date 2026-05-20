/**
 * Result of a Moving Average calculation operation.
 * Contains before/after snapshots of both MA and stock quantity.
 */
export interface MaCalculationResult {
  /** MA before this transaction */
  maBefore: number;
  /** MA after this transaction */
  maAfter: number;
  /** Stock quantity before */
  stockBefore: number;
  /** Stock quantity after */
  stockAfter: number;
}

/**
 * Input parameters for MA calculation.
 */
export interface MaCalculationInput {
  /** Current stock quantity */
  currentQty: number;
  /** Current MA (cost per unit) */
  currentMa: number;
  /** Quantity change (positive = in, negative = out) */
  qtyChange: number;
  /** Unit cost of the incoming goods (only relevant for stock-in) */
  unitCost: number;
}

/**
 * Service interface for Moving Average cost calculations.
 * MA = Total inventory value / Total quantity
 *
 * Rules:
 * - MA recalculates only on stock-in (GR_RECEIVE, GR_REPLACEMENT, CN_SALES_RETURN, ADJ_COUNT_UP, etc.)
 * - Stock-out uses current MA (no recalculation)
 * - MA must never be recalculated retroactively
 */
export interface IMaCalculationService {
  /**
   * Calculate new Moving Average and update stock balance atomically.
   * Must be called within a Prisma interactive transaction to hold the row lock.
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @param qty - Quantity of the transaction (always positive)
   * @param value - Total value of the incoming/outgoing goods (always positive)
   * @param isIncrease - true for stock-increasing TX, false for stock-decreasing TX
   * @param tx - Optional Prisma transaction client (required for row locking)
   * @returns MaCalculationResult with before/after snapshots
   */
  calculateNewMa(
    itemId: string,
    warehouseId: string,
    qty: number,
    value: number,
    isIncrease: boolean,
    tx?: unknown,
  ): Promise<MaCalculationResult>;

  /**
   * Get current Moving Average for an item at a specific warehouse.
   * Read-only — no locking required.
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @returns Current MA value, or 0 if no stock balance exists
   */
  getCurrentMa(itemId: string, warehouseId: string): Promise<number>;
}
