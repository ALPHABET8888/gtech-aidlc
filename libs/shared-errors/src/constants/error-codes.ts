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

  /** CN_RETURN has non-zero inventory fields (qty or totalCost) */
  CN_RETURN_INVENTORY: 'CN_RETURN_INVENTORY',

  /** INVOICE_FROM_DO has non-zero stock/AR fields */
  INVOICE_FROM_DO_STOCK: 'INVOICE_FROM_DO_STOCK',

  /** Alert validation failed — one or more ERROR rules violated */
  ALERT_VALIDATION_FAILED: 'ALERT_VALIDATION_FAILED',
  // ── Transactions Unit ──────────────────────────────────

  /** Job Order status is not DONE — cannot issue TEMP_DO or Invoice */
  JO_NOT_DONE: 'JO_NOT_DONE',

  /** Job Order already has a TEMP_DO issued */
  DUPLICATE_TEMP_DO: 'DUPLICATE_TEMP_DO',

  /** Return quantity exceeds original sale quantity */
  RETURN_QTY_EXCEEDED: 'RETURN_QTY_EXCEEDED',

  /** GR has already been fully returned */
  GR_ALREADY_RETURNED: 'GR_ALREADY_RETURNED',

  /** CN_RETURN must not modify inventory fields */
  CN_RETURN_INVENTORY: 'CN_RETURN_INVENTORY',

  /** GR/IR Clearing is not in OPEN status */
  CLEARING_NOT_OPEN: 'CLEARING_NOT_OPEN',

  /** Payment amount exceeds open item balance */
  PAYMENT_EXCEEDS_BALANCE: 'PAYMENT_EXCEEDS_BALANCE',

  /** Referenced open item does not exist */
  OPEN_ITEM_NOT_FOUND: 'OPEN_ITEM_NOT_FOUND',

  /** Sum of payment allocations does not equal declared totalAmount */
  ALLOCATION_SUM_MISMATCH: 'ALLOCATION_SUM_MISMATCH',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
