import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when attempting to close a GR/IR Clearing that is not in OPEN status.
 */
export class ClearingNotOpenException extends DomainException {
  constructor(clearingId: string) {
    super(
      `GR/IR Clearing ${clearingId} is not in OPEN status`,
      ErrorCodes.CLEARING_NOT_OPEN,
      HttpStatus.CONFLICT,
      { clearingId },
    );
  }
}
