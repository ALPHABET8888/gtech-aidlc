import { Injectable, NotFoundException } from '@nestjs/common';
import { TxLog, TxStatus, TxType } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { InsufficientRoleException } from '@autoflow/shared-errors';
import { AuthContext, Role } from '@autoflow/shared-types';
import { MaCalculationService } from './ma-calculation.service';

/**
 * Roles allowed to void a transaction (Manager+).
 */
const VOID_ALLOWED_ROLES: Role[] = [Role.MANAGER, Role.CFO, Role.ADMIN];

/**
 * TX types that increase stock (goods coming in).
 * When voiding these, the reverse movement is a stock decrease.
 */
const STOCK_INCREASING_TX_TYPES: TxType[] = [
  TxType.GR_RECEIVE,
  TxType.GR_REPLACEMENT,
  TxType.CN_SALES_RETURN,
  TxType.ADJ_COUNT_UP,
];

/**
 * TX types that decrease stock (goods going out).
 * When voiding these, the reverse movement is a stock increase.
 */
const STOCK_DECREASING_TX_TYPES: TxType[] = [
  TxType.TEMP_DO,
  TxType.SALE_INVOICE,
  TxType.GR_RETURN,
  TxType.ADJ_COUNT_DOWN,
  TxType.ADJ_WRITEOFF,
  TxType.ADJ_WRITEDOWN,
  TxType.SUPPLY_ISSUE,
];

/**
 * VoidService — VOIDs a POSTed transaction by creating a reverse entry.
 *
 * VOID pattern:
 * 1. Validate original TX is POSTED
 * 2. Validate reason is provided
 * 3. Validate user has Manager+ role
 * 4. Create reverse TX (negated qty and costs)
 * 5. Set original TX status to VOIDED
 * 6. Trigger MA recalculation for reverse movement
 *
 * All operations are wrapped in a single Prisma $transaction for atomicity.
 */
@Injectable()
export class VoidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txLogRepository: TxLogRepository,
    private readonly maCalculationService: MaCalculationService,
  ) {}

  /**
   * Determine if a TX type is stock-increasing.
   */
  private isStockIncreasing(txType: TxType): boolean {
    return STOCK_INCREASING_TX_TYPES.includes(txType);
  }

  /**
   * Determine if a TX type is stock-decreasing.
   */
  private isStockDecreasing(txType: TxType): boolean {
    return STOCK_DECREASING_TX_TYPES.includes(txType);
  }

  /**
   * Determine if a TX type affects stock.
   */
  private isStockAffecting(txType: TxType): boolean {
    return this.isStockIncreasing(txType) || this.isStockDecreasing(txType);
  }

  /**
   * Void a POSTed transaction.
   *
   * Creates a reverse TX with negated quantities and costs, sets the original
   * TX to VOIDED status, and triggers MA recalculation for the reverse movement.
   *
   * @param txId - The ID of the transaction to void
   * @param reason - Reason for voiding (required)
   * @param user - Authenticated user context (must have Manager+ role)
   * @returns The newly created reverse TxLog entry
   * @throws NotFoundException if the TX does not exist
   * @throws ImmutableTxException if the TX is not in POSTED status (via repository)
   * @throws InsufficientRoleException if the user does not have Manager+ role
   * @throws BadRequestException if reason is not provided
   */
  async voidTransaction(
    txId: string,
    reason: string,
    user: AuthContext,
  ): Promise<TxLog> {
    // Step 1: Validate reason is provided
    if (!reason || reason.trim().length === 0) {
      throw new NotFoundException('Void reason is required');
    }

    // Step 2: Validate user has Manager+ role
    const hasRequiredRole = user.roles.some((role) =>
      VOID_ALLOWED_ROLES.includes(role),
    );
    if (!hasRequiredRole) {
      throw new InsufficientRoleException(
        'MANAGER',
        user.roles[0] ?? 'NONE',
      );
    }

    // Step 3: Fetch the original TX
    const originalTx = await this.txLogRepository.findById(txId);
    if (!originalTx) {
      throw new NotFoundException(`Transaction ${txId} not found`);
    }

    // Step 4: Validate TX is in POSTED status
    if (originalTx.txStatus !== TxStatus.POSTED) {
      throw new NotFoundException(
        `Transaction ${txId} cannot be voided — current status is ${originalTx.txStatus}`,
      );
    }

    // Step 5: Execute atomic void operation
    const reverseTx = await this.prisma.$transaction(async (prismaClient) => {
      // ── Step 5a: MA recalculation for reverse movement ──
      let maBefore: number | null = null;
      let maAfter: number | null = null;
      let stockBefore: number | null = null;
      let stockAfter: number | null = null;

      if (
        this.isStockAffecting(originalTx.txType) &&
        originalTx.itemId &&
        originalTx.warehouseId &&
        originalTx.qty != null
      ) {
        const qty = Math.abs(Number(originalTx.qty));
        const totalCost = Math.abs(Number(originalTx.totalCost ?? 0));

        // Reverse the direction: if original increased stock, void decreases it (and vice versa)
        const isOriginalIncrease = this.isStockIncreasing(originalTx.txType);
        const isReverseIncrease = !isOriginalIncrease;

        const maResult = await this.maCalculationService.calculateNewMa(
          originalTx.itemId,
          originalTx.warehouseId,
          qty,
          totalCost,
          isReverseIncrease,
          prismaClient,
        );

        maBefore = maResult.maBefore;
        maAfter = maResult.maAfter;
        stockBefore = maResult.stockBefore;
        stockAfter = maResult.stockAfter;
      }

      // ── Step 5b: Create reverse TX entry ──
      const negatedQty = originalTx.qty != null ? -Number(originalTx.qty) : null;
      const negatedTotalCost =
        originalTx.totalCost != null ? -Number(originalTx.totalCost) : null;
      const negatedUnitCost =
        originalTx.unitCost != null ? Number(originalTx.unitCost) : null;
      const negatedBaseAmount =
        originalTx.baseAmount != null ? -Number(originalTx.baseAmount) : null;
      const negatedVatAmount =
        originalTx.vatAmount != null ? -Number(originalTx.vatAmount) : null;
      const negatedArAmount =
        originalTx.arAmount != null ? -Number(originalTx.arAmount) : null;
      const negatedApAmount =
        originalTx.apAmount != null ? -Number(originalTx.apAmount) : null;

      const createdReverseTx = await prismaClient.txLog.create({
        data: {
          txType: TxType.VOID,
          txStatus: TxStatus.POSTED,
          txDate: new Date(),
          period: originalTx.period,
          ...(originalTx.itemId && {
            item: { connect: { id: originalTx.itemId } },
          }),
          ...(originalTx.warehouseId && {
            warehouse: { connect: { id: originalTx.warehouseId } },
          }),
          qty: negatedQty,
          unitCost: negatedUnitCost,
          totalCost: negatedTotalCost,
          maBefore,
          maAfter,
          stockBefore,
          stockAfter,
          ...(originalTx.vendorId && {
            vendor: { connect: { id: originalTx.vendorId } },
          }),
          ...(originalTx.customerId && {
            customer: { connect: { id: originalTx.customerId } },
          }),
          parentTx: { connect: { id: originalTx.id } },
          taxInvoiceNo: originalTx.taxInvoiceNo,
          baseAmount: negatedBaseAmount,
          vatAmount: negatedVatAmount,
          vatType: originalTx.vatType,
          arAmount: negatedArAmount,
          apAmount: negatedApAmount,
          reason,
          createdBy: user.userId,
        },
      });

      // ── Step 5c: Update original TX status to VOIDED ──
      await prismaClient.txLog.update({
        where: { id: originalTx.id },
        data: { txStatus: TxStatus.VOIDED },
      });

      return createdReverseTx;
    });

    return reverseTx;
  }
}
