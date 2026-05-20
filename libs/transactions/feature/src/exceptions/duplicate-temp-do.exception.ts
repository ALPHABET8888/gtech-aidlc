import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when attempting to issue a TEMP_DO for a Job Order
 * that already has one issued.
 */
export class DuplicateTempDoException extends DomainException {
  constructor(joId: string) {
    super(
      `Job Order ${joId} already has a TEMP_DO issued`,
      ErrorCodes.DUPLICATE_TEMP_DO,
      HttpStatus.CONFLICT,
      { joId },
    );
  }
}
