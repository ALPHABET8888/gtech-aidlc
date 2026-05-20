import { Injectable } from '@nestjs/common';
import { TxLog, TxStatus, TxType } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { ImmutableTxException } from '@autoflow/shared-errors';
import { ITxLogService } from '@autoflow/shared-types';
import { PeriodService } from './period.service';
import { MaCalculationService } from './ma-calculation.service';
import { StockValidationService } from './stock-validation.service';
import { RefChainValidatorService, RefField } from './ref-chain-validator.service';
import { CreateTxDto } from '../dto/create-tx.dto';

/**
 * TX types that increase stock (goods coming in).
 * These types recalculate MA upward and add to stock_balance.qty.
 */
const STOCK_INCREASING_TX_TYPES: TxType[] = [
  TxType.GR_RECEIVE,
  TxType.GR_REPLACEMENT,
  TxType.CN_SALES_RETURN,
  TxType.ADJ_COUNT_UP,
];

/**
 * TX types that decrease stock (goods going out).
 * These types use current MA (unchanged) and deduct from stock_balance.qty.
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
 * Core TX Log Service — orchestrates the POST pipeline.
 *
 * Pipeline: Period check → Stock validation → RefChain check → MA calculation → POST
 *
 * Implements:
 * - Period validation (enforced)
 * - Stock validation (for stock-decreasing TX — prevents negative stock)
 * - MA calculation (for all stock-affecting TX — computes new MA atomically)
 * - Immutability enforcement (reject updates on POSTED TX)
 * - Atomic creation via Prisma $transaction
 */
@Injectable()
export class TxLogService implements ITxLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txLogRepository: TxLogRepository,
    private readonly periodService: PeriodService,
    private readonly maCalculationService: MaCalculationService,
    private readonly stockValidationService: StockValidationService,
    private readonly refChainValidatorService: RefChainValidatorService,
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
   * Determine if a TX type affects stock (either increasing or decreasing).
   */
  private isStockAffecting(txType: TxType): boolean {
    return this.isStockIncreasing(txType) || this.isStockDecreasing(txType);
  }

  /**
   * Create and POST a new transaction through the full validation pipeline.
   * Wraps entire operation in a Prisma interactive transaction for atomicity.
   *
   * Pipeline for stock-decreasing TX: validate stock → use current MA → deduct stock
   * Pipeline for stock-increasing TX: calculate new MA → add stock
   *
   * @param dto - Transaction creation DTO
   * @param userId - The ID of the user creating the transaction
   * @returns The created and POSTED TxLog entry with ma_before, ma_after, stock_before, stock_after
   */
  async createTx(dto: CreateTxDto, userId: string): Promise<TxLog> {
    // Step 1: Validate period is open (before entering transaction)
    await this.periodService.validatePeriodOpen(dto.period);

    // Step 2: For stock-decreasing TX, validate stock availability before entering transaction
    const stockAffecting = this.isStockAffecting(dto.txType);
    const isDecrease = this.isStockDecreasing(dto.txType);

    if (isDecrease && dto.itemId && dto.warehouseId && dto.qty) {
      await this.stockValidationService.validateStockAvailable(
        dto.itemId,
        dto.warehouseId,
        dto.qty,
      );
    }

    // Step 2b: Validate reference chain (if TX type has ref rules registered)
    const refFields: Partial<Record<RefField, string | null>> = {
      refJoId: dto.refJoId ?? null,
      refDoId: dto.refDoId ?? null,
      refInvoiceId: dto.refInvoiceId ?? null,
      refGrId: dto.refGrId ?? null,
      refCnId: dto.refCnId ?? null,
    };
    await this.refChainValidatorService.validateRefChain(dto.txType, refFields);

    // Step 3: Execute atomic pipeline within a Prisma transaction
    const tx = await this.prisma.$transaction(async (prismaClient) => {
      // ── Step 3a: MA calculation for stock-affecting TX ──
      let maBefore: number | null = null;
      let maAfter: number | null = null;
      let stockBefore: number | null = null;
      let stockAfter: number | null = null;

      if (stockAffecting && dto.itemId && dto.warehouseId && dto.qty != null) {
        const totalValue = dto.totalCost ?? (dto.qty * (dto.unitCost ?? 0));
        const isIncrease = this.isStockIncreasing(dto.txType);

        const maResult = await this.maCalculationService.calculateNewMa(
          dto.itemId,
          dto.warehouseId,
          dto.qty,
          totalValue,
          isIncrease,
          prismaClient,
        );

        maBefore = maResult.maBefore;
        maAfter = maResult.maAfter;
        stockBefore = maResult.stockBefore;
        stockAfter = maResult.stockAfter;
      }

      // ── Step 3b: Create TX entry with DRAFT status and MA/stock snapshots ──
      // TXs are created as DRAFT by default; approval endpoint handles DRAFT→POSTED.
      const createdTx = await prismaClient.txLog.create({
        data: {
          txType: dto.txType,
          txStatus: TxStatus.DRAFT,
          txDate: new Date(dto.txDate),
          period: dto.period,
          ...(dto.itemId && { item: { connect: { id: dto.itemId } } }),
          ...(dto.warehouseId && {
            warehouse: { connect: { id: dto.warehouseId } },
          }),
          qty: dto.qty ?? null,
          unitCost: dto.unitCost ?? null,
          totalCost: dto.totalCost ?? null,
          maBefore,
          maAfter,
          stockBefore,
          stockAfter,
          ...(dto.vendorId && { vendor: { connect: { id: dto.vendorId } } }),
          ...(dto.customerId && {
            customer: { connect: { id: dto.customerId } },
          }),
          ...(dto.refJoId && { refJo: { connect: { id: dto.refJoId } } }),
          ...(dto.refDoId && { refDo: { connect: { id: dto.refDoId } } }),
          ...(dto.refInvoiceId && {
            refInvoice: { connect: { id: dto.refInvoiceId } },
          }),
          ...(dto.refGrId && { refGr: { connect: { id: dto.refGrId } } }),
          ...(dto.refCnId && { refCn: { connect: { id: dto.refCnId } } }),
          ...(dto.parentTxId && {
            parentTx: { connect: { id: dto.parentTxId } },
          }),
          taxInvoiceNo: dto.taxInvoiceNo ?? null,
          baseAmount: dto.baseAmount ?? null,
          vatAmount: dto.vatAmount ?? null,
          vatType: dto.vatType ?? null,
          arAmount: dto.arAmount ?? null,
          apAmount: dto.apAmount ?? null,
          reason: dto.reason ?? null,
          createdBy: userId,
        },
      });

      return createdTx;
    });

    return tx;
  }

  /**
   * Get a single TX by ID.
   * @throws NotFoundException from repository if not found
   */
  async getTx(id: string): Promise<TxLog | null> {
    return this.txLogRepository.findById(id);
  }

  /**
   * Find a TX by ID — alias for getTx, satisfies ITxLogService interface.
   */
  async findById(txId: string): Promise<TxLog | null> {
    return this.txLogRepository.findById(txId);
  }

  /**
   * Enforce immutability: reject any modification to a POSTED transaction.
   * Only DRAFT→POSTED and POSTED→VOIDED status transitions are allowed
   * (handled by TxLogRepository.updateStatus).
   *
   * This method is used before any field update attempt to guard immutability.
   *
   * @param txId - The transaction ID to check
   * @throws ImmutableTxException if the transaction is already POSTED or VOIDED
   */
  async assertMutable(txId: string): Promise<void> {
    const tx = await this.txLogRepository.findById(txId);

    if (!tx) {
      return;
    }

    if (tx.txStatus === TxStatus.POSTED || tx.txStatus === TxStatus.VOIDED) {
      throw new ImmutableTxException(txId);
    }
  }
}
