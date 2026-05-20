import { TxType } from '../enums/tx-type.enum';

/**
 * DTO for reference chain validation.
 * Contains all possible reference fields that link transactions together.
 */
export interface RefChainDto {
  /** Reference to Purchase Order */
  refPoId?: string;
  /** Reference to Goods Receive */
  refGrId?: string;
  /** Reference to Invoice */
  refInvoiceId?: string;
  /** Reference to Return */
  refReturnId?: string;
  /** Reference to Credit Note */
  refCnId?: string;
  /** Reference to Job Order */
  refJoId?: string;
  /** Reference to Delivery Order */
  refDoId?: string;
  /** Parent TX ID (for VOID) */
  parentTxId?: string;
}

/**
 * Service interface for reference chain validation.
 * Ensures that transactions reference valid, existing parent transactions.
 *
 * Rules:
 * - CN_RETURN must reference a GR_RETURN
 * - CN_SALES_RETURN must reference a SALE_INVOICE or INVOICE_FROM_DO
 * - INVOICE_FROM_DO must reference a TEMP_DO
 * - VOID must reference a POSTED TX
 */
export interface IRefChainService {
  /**
   * Validate that the reference chain is valid for the given TX type.
   * Checks that referenced TXs exist and are in correct status.
   *
   * @throws RefChainInvalidException if validation fails
   */
  validateRefChain(txType: TxType, refs: RefChainDto): Promise<void>;
}
