import { Injectable, OnModuleInit } from '@nestjs/common';
import { TxType, TxStatus } from '@prisma/client';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { RefChainInvalidException } from '@autoflow/shared-errors';
import { IRefChainService } from '@autoflow/shared-types';

/**
 * A single ref chain rule: for a given TX type, which reference fields are required.
 */
export interface RefChainRule {
  txType: TxType;
  requiredRefs: RefField[];
}

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
  txType: TxType;
  refField: RefField;
  reason: 'MISSING' | 'NOT_POSTED';
  refTxId?: string;
}

/**
 * RefChainValidator — validates reference chain integrity before POST.
 *
 * Uses a rule registry pattern:
 * - At module init, default rules are registered (which TX types require which refs)
 * - At validation time, rules for the current TX type are looked up
 * - Each required ref field is checked: must exist and must be in POSTED status
 *
 * Extensible: other modules can call registerRule() to add their own constraints.
 */
@Injectable()
export class RefChainValidatorService implements OnModuleInit, IRefChainService {
  private readonly rules = new Map<TxType, RefField[]>();

  constructor(private readonly txLogRepository: TxLogRepository) {}

  /**
   * Register default validation rules on module initialization.
   *
   * Default rules from design:
   * - CN (CN_RETURN, CN_PRICE_ADJ, CN_SALES_RETURN, CN_SALES_PRICE) → requires refInvoiceId
   * - GR_RETURN → requires refGrId (must reference a GR_RECEIVE)
   * - INVOICE_FROM_DO → requires refDoId (must reference a TEMP_DO)
   */
  onModuleInit(): void {
    // CN types require a reference to an invoice
    this.registerRule(TxType.CN_RETURN, ['refInvoiceId']);
    this.registerRule(TxType.CN_PRICE_ADJ, ['refInvoiceId']);
    this.registerRule(TxType.CN_SALES_RETURN, ['refInvoiceId']);
    this.registerRule(TxType.CN_SALES_PRICE, ['refInvoiceId']);

    // GR_RETURN requires a reference to a GR_RECEIVE
    this.registerRule(TxType.GR_RETURN, ['refGrId']);

    // INVOICE_FROM_DO requires a reference to a TEMP_DO
    this.registerRule(TxType.INVOICE_FROM_DO, ['refDoId']);
  }

  /**
   * Register a validation rule for a TX type.
   * If rules already exist for the TX type, the new refs are merged (no duplicates).
   *
   * @param txType - The transaction type this rule applies to
   * @param requiredRefs - Array of reference field names that must be present and POSTED
   */
  registerRule(txType: TxType, requiredRefs: RefField[]): void {
    const existing = this.rules.get(txType) ?? [];
    const merged = [...new Set([...existing, ...requiredRefs])];
    this.rules.set(txType, merged);
  }

  /**
   * Validate reference chain for a transaction.
   * Checks all required refs for the given TX type exist and are in POSTED status.
   *
   * @param txType - The type of transaction being created
   * @param refFields - Object mapping ref field names to their values (TX IDs or null)
   * @throws RefChainInvalidException with specific violation details
   */
  async validateRefChain(
    txType: TxType,
    refFields: Partial<Record<RefField, string | null>>,
  ): Promise<void> {
    const requiredRefs = this.rules.get(txType);

    // If no rules registered for this TX type, validation passes
    if (!requiredRefs || requiredRefs.length === 0) {
      return;
    }

    const violations: RefChainViolation[] = [];

    for (const refField of requiredRefs) {
      const refTxId = refFields[refField];

      // Check if required ref field is provided
      if (!refTxId) {
        violations.push({
          txType,
          refField,
          reason: 'MISSING',
        });
        continue;
      }

      // Check if referenced TX exists and is POSTED
      const referencedTx = await this.txLogRepository.findById(refTxId);

      if (!referencedTx) {
        violations.push({
          txType,
          refField,
          reason: 'MISSING',
          refTxId,
        });
        continue;
      }

      if (referencedTx.txStatus !== TxStatus.POSTED) {
        violations.push({
          txType,
          refField,
          reason: 'NOT_POSTED',
          refTxId,
        });
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map((v) => {
          if (v.reason === 'MISSING' && !v.refTxId) {
            return `${v.refField} is required for ${v.txType} but was not provided`;
          }
          if (v.reason === 'MISSING' && v.refTxId) {
            return `${v.refField} references non-existent TX ${v.refTxId}`;
          }
          return `${v.refField} references TX ${v.refTxId} which is not in POSTED status`;
        })
        .join('; ');

      throw new RefChainInvalidException(
        txType,
        violations[0].refTxId ?? 'null',
        details,
      );
    }
  }

  /**
   * Get all registered rules (useful for debugging/testing).
   */
  getRules(): Map<TxType, RefField[]> {
    return new Map(this.rules);
  }
}
