/**
 * Stock validation result.
 */
export interface StockValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Current available stock quantity */
  availableQty: number;
  /** Requested quantity */
  requestedQty: number;
  /** Error message if validation failed */
  errorMessage?: string;
}

/**
 * Service interface for stock validation.
 * Ensures stock never goes negative — system throws error before POST.
 */
export interface IStockValidationService {
  /**
   * Validate that sufficient stock is available for a stock-out operation.
   * Also checks if stock is frozen (during stock count).
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @param qty - Quantity to deduct (positive number)
   * @throws StockFrozenException if stock is frozen during count
   * @throws StockNegativeException if stock would go negative
   */
  validateStockAvailable(
    itemId: string,
    warehouseId: string,
    qty: number,
  ): Promise<void>;

  /**
   * Get current stock balance quantity for an item in a warehouse.
   * Returns 0 if no stock balance record exists.
   *
   * @param itemId - The item ID
   * @param warehouseId - The warehouse ID
   * @returns Current stock quantity
   */
  getStockBalance(itemId: string, warehouseId: string): Promise<number>;
}
