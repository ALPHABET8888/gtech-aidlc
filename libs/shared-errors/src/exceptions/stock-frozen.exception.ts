import { HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../constants/error-codes';
import { DomainException } from './domain-exception';

/**
 * Thrown when a stock movement is attempted on a frozen item/warehouse pair.
 * Stock is frozen during physical stock count — no issues or receipts allowed.
 */
export class StockFrozenException extends DomainException {
  constructor(itemId: string, warehouseId: string) {
    super(
      `Stock frozen during count for item ${itemId} in warehouse ${warehouseId}`,
      ErrorCodes.STOCK_FROZEN,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { itemId, warehouseId },
    );
  }
}
