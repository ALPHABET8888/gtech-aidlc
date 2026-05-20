import { Injectable, Inject } from '@nestjs/common';
import {
  ITxLogService,
  IMaCalculationService,
  IStockValidationService,
  IPeriodService,
  TxType,
} from '@autoflow/shared-types';
import {
  CreateGoodsReceiptDto,
  CreateGoodsReturnDto,
  CreateGrReplacementDto,
} from '../dto/purchasing';
import { ApService } from '../ap-ar/ap.service';
import { GrIrClearingService } from './gr-ir-clearing.service';
import { GrAlreadyReturnedException, ClearingNotOpenException } from '../exceptions';

/**
 * GoodsReceiptService — handles GR_RECEIVE, GR_RETURN, GR_REPLACEMENT transactions.
 *
 * GR_RECEIVE: stock increase + MA recalculation + AP Open Item creation
 * GR_RETURN: stock decrease + GR/IR Clearing open
 * GR_REPLACEMENT: stock increase from clearing + clearing close
 */
@Injectable()
export class GoodsReceiptService {
  constructor(
    @Inject('ITxLogService')
    private readonly txLogService: ITxLogService,
    @Inject('IMaCalculationService')
    private readonly maService: IMaCalculationService,
    @Inject('IStockValidationService')
    private readonly stockService: IStockValidationService,
    @Inject('IPeriodService')
    private readonly periodService: IPeriodService,
    private readonly apService: ApService,
    private readonly clearingService: GrIrClearingService,
  ) {}

  /**
   * Create Goods Receipt (GR_RECEIVE).
   * - Validates period is open
   * - Creates TX Log entry (pipeline handles MA + stock internally)
   * - Creates AP Open Item
   */
  async createGoodsReceipt(dto: CreateGoodsReceiptDto, userId: string) {
    // 1. Validate period
    await this.periodService.validatePeriodOpen(dto.period);

    // 2. Process each item — create TX entries via pipeline
    const txEntries: unknown[] = [];
    let totalApAmount = 0;

    for (const item of dto.items) {
      const totalCostPerItem = (item.unitCost + item.landedCost) * item.qty;
      totalApAmount += totalCostPerItem;

      // Create TX log entry — the pipeline handles MA calculation and stock update
      const txEntry = await this.txLogService.createTx(
        {
          txType: TxType.GR_RECEIVE,
          txDate: new Date().toISOString(),
          period: dto.period,
          itemId: item.itemId,
          warehouseId: dto.warehouseId,
          qty: item.qty,
          unitCost: item.unitCost + item.landedCost,
          totalCost: totalCostPerItem,
          vendorId: dto.vendorId,
          apAmount: totalCostPerItem,
          taxInvoiceNo: dto.taxInvoiceNo,
        },
        userId,
      );

      txEntries.push(txEntry);
    }

    // 3. Calculate VAT (7%)
    const vatAmount = Math.round(totalApAmount * 0.07 * 100) / 100;
    const grandTotal = Math.round((totalApAmount + vatAmount) * 100) / 100;

    // 4. Create AP Open Item via ApService
    const firstTx = txEntries[0] as { id?: string; txId?: string };
    const txId = firstTx.id ?? firstTx.txId ?? '';

    const apOpenItem = await this.apService.createApOpenItem({
      vendorId: dto.vendorId,
      txId,
      txType: TxType.GR_RECEIVE,
      originalAmount: grandTotal,
      vatAmount,
      taxInvoiceNo: dto.taxInvoiceNo,
      period: dto.period,
    });

    return {
      txEntry: {
        id: txId,
        txType: TxType.GR_RECEIVE,
        status: 'POSTED',
      },
      apOpenItem: {
        id: apOpenItem.id,
        status: apOpenItem.status,
        originalAmount: Number(apOpenItem.originalAmount),
      },
    };
  }

  /**
   * Create Goods Return (GR_RETURN).
   * - Validates stock availability
   * - Validates period is open
   * - Validates GR hasn't been fully returned
   * - Decreases stock (uses current MA)
   * - Opens GR/IR Clearing
   */
  async createGoodsReturn(dto: CreateGoodsReturnDto, userId: string) {
    // 1. Validate period
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate the referenced GR exists
    const refGrTx = await this.txLogService.findById(dto.refGrTxId);
    if (!refGrTx) {
      throw new GrAlreadyReturnedException(dto.refGrTxId);
    }

    // 3. Process each item — validate stock and create TX
    const txEntries: unknown[] = [];
    let totalClearingAmount = 0;

    for (const item of dto.items) {
      // Validate stock availability for return
      await this.stockService.validateStockAvailable(
        item.itemId,
        dto.warehouseId,
        item.qty,
      );

      // Get current MA for clearing amount calculation
      const currentMa = await this.maService.getCurrentMa(item.itemId, dto.warehouseId);
      const itemClearingAmount = Math.round(item.qty * currentMa * 100) / 100;
      totalClearingAmount += itemClearingAmount;

      // Create TX log entry — pipeline handles stock decrease
      const txEntry = await this.txLogService.createTx(
        {
          txType: TxType.GR_RETURN,
          txDate: new Date().toISOString(),
          period: currentPeriod,
          itemId: item.itemId,
          warehouseId: dto.warehouseId,
          qty: item.qty,
          unitCost: currentMa,
          totalCost: itemClearingAmount,
          vendorId: dto.vendorId,
          parentTxId: dto.refGrTxId,
        },
        userId,
      );

      txEntries.push(txEntry);
    }

    // 4. Open GR/IR Clearing
    const firstTx = txEntries[0] as { id?: string; txId?: string };
    const txId = firstTx.id ?? firstTx.txId ?? '';

    const clearing = await this.clearingService.openClearing({
      grReturnTxId: txId,
      grReceiveTxId: dto.refGrTxId,
      vendorId: dto.vendorId,
      itemId: dto.items[0].itemId,
      qty: dto.items[0].qty,
      clearingAmount: totalClearingAmount,
    });

    return {
      txEntry: {
        id: txId,
        txType: TxType.GR_RETURN,
        status: 'POSTED',
      },
      clearing: {
        id: clearing.id,
        clearingAmount: Number(clearing.clearingAmount),
        status: clearing.status,
      },
    };
  }

  /**
   * Receive Replacement Goods (GR_REPLACEMENT).
   * - Validates clearing is OPEN
   * - Validates period is open
   * - Increases stock (recalculates MA from clearing)
   * - Closes clearing with PPV = 0
   */
  async receiveReplacement(dto: CreateGrReplacementDto, userId: string) {
    // 1. Validate period
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate clearing exists and is OPEN
    const clearing = await this.clearingService.findById(dto.clearingId);
    if (!clearing || clearing.status !== 'OPEN') {
      throw new ClearingNotOpenException(dto.clearingId);
    }

    // 3. Process each item — create TX via pipeline
    const txEntries: unknown[] = [];

    for (const item of dto.items) {
      // Use clearing amount / qty as the unit cost for replacement
      const unitCost = Number(clearing.clearingAmount) / Number(clearing.qty);

      // Create TX log entry — pipeline handles MA recalculation
      const txEntry = await this.txLogService.createTx(
        {
          txType: TxType.GR_REPLACEMENT,
          txDate: new Date().toISOString(),
          period: currentPeriod,
          itemId: item.itemId,
          warehouseId: dto.warehouseId,
          qty: item.qty,
          unitCost,
          totalCost: Math.round(item.qty * unitCost * 100) / 100,
          vendorId: clearing.vendorId,
          parentTxId: dto.refGrReturnTxId,
        },
        userId,
      );

      txEntries.push(txEntry);
    }

    // 4. Close clearing by replacement (PPV = 0)
    const firstTx = txEntries[0] as { id?: string; txId?: string };
    const txId = firstTx.id ?? firstTx.txId ?? '';

    const closedClearing = await this.clearingService.closeByReplacement(
      dto.clearingId,
      txId,
    );

    return {
      txEntry: {
        id: txId,
        txType: TxType.GR_REPLACEMENT,
        status: 'POSTED',
      },
      clearing: {
        id: closedClearing.id,
        status: closedClearing.status,
        ppvAmount: Number(closedClearing.ppvAmount ?? 0),
      },
    };
  }
}
