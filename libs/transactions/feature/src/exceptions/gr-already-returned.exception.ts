import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when attempting to return goods from a GR that has already been fully returned.
 */
export class GrAlreadyReturnedException extends DomainException {
  constructor(grTxId: string) {
    super(
      `Goods Receipt ${grTxId} has already been fully returned`,
      ErrorCodes.GR_ALREADY_RETURNED,
      HttpStatus.CONFLICT,
      { grTxId },
    );
  }
}
