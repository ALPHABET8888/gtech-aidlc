import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when attempting to issue an Invoice for a Job Order
 * that already has one issued.
 */
export class DuplicateInvoiceException extends DomainException {
  constructor(joId: string) {
    super(
      `Job Order ${joId} already has an invoice issued`,
      ErrorCodes.DUPLICATE_INVOICE,
      HttpStatus.CONFLICT,
      { joId },
    );
  }
}
