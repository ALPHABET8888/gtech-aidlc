import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when CN_RETURN attempts to modify inventory fields.
 * CN_RETURN must only affect AP — no inventory impact allowed.
 */
export class CnReturnInventoryException extends DomainException {
  constructor(clearingId: string) {
    super(
      `CN_RETURN for clearing ${clearingId} must not modify inventory fields`,
      ErrorCodes.CN_RETURN_INVENTORY,
      HttpStatus.BAD_REQUEST,
      { clearingId },
    );
  }
}
