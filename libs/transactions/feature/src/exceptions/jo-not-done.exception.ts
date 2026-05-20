import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when attempting to issue TEMP_DO or Invoice from a Job Order
 * that is not in DONE status.
 */
export class JoNotDoneException extends DomainException {
  constructor(joId: string, currentStatus: string) {
    super(
      `Job Order ${joId} is not DONE (current: ${currentStatus}). Cannot issue TEMP_DO or Invoice.`,
      ErrorCodes.JO_NOT_DONE,
      HttpStatus.BAD_REQUEST,
      { joId, currentStatus },
    );
  }
}
