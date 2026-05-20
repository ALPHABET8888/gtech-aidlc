import { Inject, Injectable } from '@nestjs/common';
import { CreateTxDto, TxType } from '@autoflow/shared-types';
import { IStockValidationService, IPeriodService } from '@autoflow/shared-types';
import {
  TX_LOG_SERVICE,
  STOCK_VALIDATION_SERVICE,
  PERIOD_SERVICE,
} from '../di-tokens';
import { AlertError, AlertValidationResult } from './dto/alert-validation-result.dto';

/**
 * Stock-decreasing TX types that require stock availability validation.
 */
const STOCK_DECREASING_TX_TYPES: TxType[] = [
  TxType.SALE_INVOICE,
  TxType.TEMP_DO,
  TxType.GR_RETURN,
  TxType.ADJ_COUNT_DOWN,
  TxType.ADJ_TRANSFER,
  TxType.ADJ_WRITEOFF,
];

/**
 * Interface for the TX Log service methods used by alert rules.
 * Extends the base ITxLogService with reports-specific lookup methods.
 */
interface IAlertTxLogService {
  hasInvoiceForJo(refJoId: string): Promise<boolean>;
  hasTempDoForJo(refJoId: string): Promise<boolean>;
  getStockBalance(itemId: string, warehouseId: string): Promise<{ qty: number; ma: number }>;
}

/**
 * AlertRuleService — contains 5 hardcoded ERROR validation rules.
 * Evaluates ALL rules and returns ALL violations (does not short-circuit).
 *
 * Rules:
 * 1. STOCK_NEGATIVE — stock-decreasing TX would cause negative qty
 * 2. CN_RETURN_INVENTORY — CN_RETURN has non-zero qty or totalCost
 * 3. DUPLICATE_INVOICE — SALE_INVOICE/INVOICE_FROM_DO references JO with existing invoice or has_temp_do
 * 4. INVOICE_FROM_DO_STOCK — INVOICE_FROM_DO has non-zero qty, totalCost, or arAmount
 * 5. PERIOD_LOCKED — period status is CLOSED
 */
@Injectable()
export class AlertRuleService {
  constructor(
    @Inject(TX_LOG_SERVICE)
    private readonly txLogService: IAlertTxLogService,
    @Inject(STOCK_VALIDATION_SERVICE)
    private readonly stockValidationService: IStockValidationService,
    @Inject(PERIOD_SERVICE)
    private readonly periodService: IPeriodService,
  ) {}

  /**
   * Validate a CreateTxDto against all 5 ERROR rules.
   * Returns ALL violated rules (not just the first).
   */
  async validatePrePost(dto: CreateTxDto): Promise<AlertValidationResult> {
    const errors: AlertError[] = [];

    // Run all 5 rules in parallel for performance
    const [stockError, cnReturnError, duplicateInvoiceError, invoiceFromDoError, periodError] =
      await Promise.all([
        this.checkStockNegative(dto),
        this.checkCnReturnInventory(dto),
        this.checkDuplicateInvoice(dto),
        this.checkInvoiceFromDoStock(dto),
        this.checkPeriodLocked(dto),
      ]);

    if (stockError) errors.push(stockError);
    if (cnReturnError) errors.push(cnReturnError);
    if (duplicateInvoiceError) errors.push(duplicateInvoiceError);
    if (invoiceFromDoError) errors.push(invoiceFromDoError);
    if (periodError) errors.push(periodError);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Rule 1: STOCK_NEGATIVE
   * Check if a stock-decreasing TX would cause negative qty.
   */
  private async checkStockNegative(dto: CreateTxDto): Promise<AlertError | null> {
    if (!STOCK_DECREASING_TX_TYPES.includes(dto.txType)) {
      return null;
    }

    if (!dto.itemId || !dto.warehouseId) {
      return null;
    }

    const requiredQty = Math.abs(dto.qty);
    if (requiredQty === 0) {
      return null;
    }

    try {
      await this.stockValidationService.validateStockAvailable(
        dto.itemId,
        dto.warehouseId,
        requiredQty,
      );
      return null;
    } catch {
      const availableQty = await this.stockValidationService.getStockBalance(
        dto.itemId,
        dto.warehouseId,
      );
      return {
        code: 'STOCK_NEGATIVE',
        message: 'สต็อกไม่เพียงพอ',
        details: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          available: availableQty,
          requested: requiredQty,
        },
      };
    }
  }

  /**
   * Rule 2: CN_RETURN_INVENTORY
   * Check if CN_RETURN has non-zero qty or totalCost.
   */
  private async checkCnReturnInventory(dto: CreateTxDto): Promise<AlertError | null> {
    if (dto.txType !== TxType.CN_RETURN) {
      return null;
    }

    if (dto.qty !== 0 || dto.totalCost !== 0) {
      return {
        code: 'CN_RETURN_INVENTORY',
        message: 'CN_RETURN ห้ามมีรายการสต็อก',
        details: {
          qty: dto.qty,
          totalCost: dto.totalCost,
        },
      };
    }

    return null;
  }

  /**
   * Rule 3: DUPLICATE_INVOICE
   * Check if SALE_INVOICE/INVOICE_FROM_DO references JO with existing invoice or has_temp_do.
   */
  private async checkDuplicateInvoice(dto: CreateTxDto): Promise<AlertError | null> {
    if (dto.txType !== TxType.SALE_INVOICE && dto.txType !== TxType.INVOICE_FROM_DO) {
      return null;
    }

    if (!dto.refJoId) {
      return null;
    }

    // Check if JO already has an invoice
    const hasInvoice = await this.txLogService.hasInvoiceForJo(dto.refJoId);
    if (hasInvoice) {
      return {
        code: 'DUPLICATE_INVOICE',
        message: 'ใบสั่งงานนี้มีใบแจ้งหนี้แล้ว',
        details: {
          refJoId: dto.refJoId,
          txType: dto.txType,
        },
      };
    }

    // For SALE_INVOICE, also check if JO has TEMP_DO
    if (dto.txType === TxType.SALE_INVOICE) {
      const hasTempDo = await this.txLogService.hasTempDoForJo(dto.refJoId);
      if (hasTempDo) {
        return {
          code: 'DUPLICATE_INVOICE',
          message: 'ห้ามสร้าง SALE_INVOICE จาก JO ที่มี TEMP_DO',
          details: {
            refJoId: dto.refJoId,
            txType: dto.txType,
            hasTempDo: true,
          },
        };
      }
    }

    return null;
  }

  /**
   * Rule 4: INVOICE_FROM_DO_STOCK
   * Check if INVOICE_FROM_DO has non-zero qty, totalCost, or arAmount.
   */
  private async checkInvoiceFromDoStock(dto: CreateTxDto): Promise<AlertError | null> {
    if (dto.txType !== TxType.INVOICE_FROM_DO) {
      return null;
    }

    const arAmount = dto.arAmount ?? 0;

    if (dto.qty !== 0 || dto.totalCost !== 0 || arAmount !== 0) {
      return {
        code: 'INVOICE_FROM_DO_STOCK',
        message: 'INVOICE_FROM_DO ห้ามมีรายการสต็อก/AR',
        details: {
          qty: dto.qty,
          totalCost: dto.totalCost,
          arAmount,
        },
      };
    }

    return null;
  }

  /**
   * Rule 5: PERIOD_LOCKED
   * Check if the period status is CLOSED.
   */
  private async checkPeriodLocked(dto: CreateTxDto): Promise<AlertError | null> {
    try {
      await this.periodService.validatePeriodOpen(dto.period);
      return null;
    } catch {
      return {
        code: 'PERIOD_LOCKED',
        message: 'งวดบัญชีถูกปิดแล้ว',
        details: {
          period: dto.period,
          status: 'CLOSED',
        },
      };
    }
  }
}
