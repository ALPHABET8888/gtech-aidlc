import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when the sum of payment allocations does not equal the declared totalAmount.
 * This ensures no money leak — every payment must be fully allocated.
 */
export class AllocationSumMismatchException extends DomainException {
  constructor(allocationSum: number, totalAmount: number) {
    super(
      `Allocation sum (${allocationSum}) does not equal total amount (${totalAmount})`,
      ErrorCodes.ALLOCATION_SUM_MISMATCH,
      HttpStatus.BAD_REQUEST,
      { allocationSum, totalAmount },
    );
  }
}
