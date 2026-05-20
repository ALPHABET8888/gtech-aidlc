/**
 * Supported reference field names on TxLog that can be validated.
 */
export type RefField =
  | 'refJoId'
  | 'refDoId'
  | 'refInvoiceId'
  | 'refGrId'
  | 'refCnId';

/**
 * Violation detail when a reference chain rule is broken.
 */
export interface RefChainViolation {
  refField: RefField;
  reason: 'MISSING' | 'NOT_POSTED';
  refTxId?: string;
}

/**
 * Service interface for reference chain validation.
 * Validates that referenced transactions exist and are in POSTED status.
 *
 * Uses a rule registry pattern — extensible by downstream units registering
 * their own rules via registerRule().
 */
export interface IRefChainService {
  /**
   * Register a validation rule for a TX type.
   * If rules already exist for the TX type, the new refs are merged (no duplicates).
   *
   * @param txType - The transaction type this rule applies to (string to avoid enum dependency)
   * @param requiredRefs - Array of reference field names that must be present and POSTED
   */
  registerRule(txType: string, requiredRefs: RefField[]): void;

  /**
   * Validate reference chain for a transaction.
   * Checks all required refs for the given TX type exist and are in POSTED status.
   *
   * @param txType - The type of transaction being created
   * @param refFields - Object mapping ref field names to their values (TX IDs or null)
   * @throws RefChainInvalidException with specific violation details
   */
  validateRefChain(
    txType: string,
    refFields: Partial<Record<RefField, string | null>>,
  ): Promise<void>;
}
