import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when a payment allocation amount exceeds the open item's remaining balance.
 */
export class PaymentExceedsBalanceException extends DomainException {
  constructor(openItemId: string, paymentAmount: number, remainingBalance: number) {
    super(
      `Payment amount (${paymentAmount}) exceeds remaining balance (${remainingBalance}) for open item ${openItemId}`,
      ErrorCodes.PAYMENT_EXCEEDS_BALANCE,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { openItemId, paymentAmount, remainingBalance },
    );
  }
}
