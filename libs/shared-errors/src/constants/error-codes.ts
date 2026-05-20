/**
 * Domain-specific error codes for the Autoflow system.
 * Used in DomainException to identify specific business rule violations.
 */
export const ErrorCodes = {
  /** Stock quantity would go negative after this operation */
  STOCK_NEGATIVE: 'STOCK_NEGATIVE',

  /** The target accounting period is locked and cannot accept new postings */
  PERIOD_LOCKED: 'PERIOD_LOCKED',

  /** Transaction is immutable and cannot be modified after POST */
  TX_IMMUTABLE: 'TX_IMMUTABLE',

  /** Reference chain between transactions is invalid or broken */
  REF_CHAIN_INVALID: 'REF_CHAIN_INVALID',

  /** Operation requires approval from a higher-level role */
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',

  /** An invoice with this number already exists */
  DUPLICATE_INVOICE: 'DUPLICATE_INVOICE',

  /** User does not have the required role for this operation */
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',

  /** Stock is frozen during stock count — no movements allowed */
  STOCK_FROZEN: 'STOCK_FROZEN',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
