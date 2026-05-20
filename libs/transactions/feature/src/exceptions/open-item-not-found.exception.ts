import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCodes } from '@autoflow/shared-errors';

/**
 * Thrown when a referenced AP/AR open item does not exist.
 */
export class OpenItemNotFoundException extends DomainException {
  constructor(openItemId: string) {
    super(
      `Open item ${openItemId} not found`,
      ErrorCodes.OPEN_ITEM_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      { openItemId },
    );
  }
}
