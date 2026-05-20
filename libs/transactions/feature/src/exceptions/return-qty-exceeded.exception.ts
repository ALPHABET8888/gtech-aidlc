import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when a CN return quantity exceeds the original sale/GR quantity.
 */
export class ReturnQtyExceededException extends DomainException {
  constructor(itemId: string, returnQty: number, originalQty: number) {
    super(
      `Return qty (${returnQty}) exceeds original qty (${originalQty}) for item ${itemId}`,
      ErrorCodes.RETURN_QTY_EXCEEDED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { itemId, returnQty, originalQty },
    );
  }
}
