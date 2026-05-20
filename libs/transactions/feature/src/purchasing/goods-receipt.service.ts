import { Injectable, Inject } from '@nestjs/common';
import {
  ITxLogService,
  IMaCalculationService,
  IStockValidationService,
  IPeriodService,
  TxType,
  TxLogEntry,
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
   * - Calculates MA for each item
   * - Creates TX Log entry
   * - Creates AP Open Item
   */
  async createGoodsReceipt(dto: CreateGoodsReceiptDto, userId: string) {
    // 1. Validate period
    await this.periodService.validatePeriodOpen(dto.period);

    // 2. Process each item — calculate MA and create TX entries
    const txEntries: TxLogEntry[] = [];
    let totalApAmount = 0;

    for (const item of dto.items) {
      const totalCostPerItem = (item.unitCost + item.landedCost) * item.qty;
      totalApAmount += totalCostPerItem;

      // Get current MA for the item
      const currentMa = await this.maService.getCurrentMa(item.itemId, dto.warehouseId);
      const currentStock = await this.stockService.getStockBalance(item.itemId, dto.warehouseId);

      // Calculate new MA
      const maResult = this.maService.calculateMa({
        currentQty: currentStock,
        currentMa,
        qtyChange: item.qty,
        unitCost: item.unitCost + item.landedCost,
      });

      // Create TX log entry
      const txEntry = await this.txLogService.createTx({
        txType: TxType.GR_RECEIVE,
        txDate: new Date().toISOString(),
        period: dto.period,
        itemId: item.itemId,
        warehouseId: dto.warehouseId,
        qty: item.qty,
        unitCost: item.unitCost + item.landedCost,
        totalCost: totalCostPerItem,
        cogsUnit: null,
        vendorId: dto.vendorId,
        customerId: null,
        apAmount: totalCostPerItem,
        arAmount: 0,
        parentTxId: null,
        createdBy: userId,
        postedBy: null,
      });

      // Post the TX
      const postedTx = await this.txLogService.postTx(txEntry.txId, userId);
      txEntries.push(postedTx);
    }

    // 3. Calculate VAT (7%)
    const vatAmount = Math.round(totalApAmount * 0.07 * 100) / 100;
    const grandTotal = Math.round((totalApAmount + vatAmount) * 100) / 100;

    // 4. Create AP Open Item via ApService
    const apOpenItem = await this.apService.createApOpenItem({
      vendorId: dto.vendorId,
      txId: txEntries[0].txId,
      txType: TxType.GR_RECEIVE,
      originalAmount: grandTotal,
      vatAmount,
      taxInvoiceNo: dto.taxInvoiceNo,
      period: dto.period,
    });

    // 5. Get MA before/after from first item for response
    const firstItem = dto.items[0];
    const currentMa = await this.maService.getCurrentMa(firstItem.itemId, dto.warehouseId);

    return {
      txEntry: {
        id: txEntries[0].txId,
        txType: TxType.GR_RECEIVE,
        status: 'POSTED',
        maBefore: txEntries[0].maBefore,
        maAfter: txEntries[0].maAfter,
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
    // 1. Validate period (use current period)
    const currentPeriod = this.periodService.getCurrentPeriod();
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate the referenced GR exists
    const refGrTx = await this.txLogService.findById(dto.refGrTxId);
    if (!refGrTx) {
      throw new GrAlreadyReturnedException(dto.refGrTxId);
    }

    // 3. Process each item — validate stock and create TX
    const txEntries: TxLogEntry[] = [];
    let totalClearingAmount = 0;

    for (const item of dto.items) {
      // Validate stock availability for return
      await this.stockService.validateStockAvailability(
        item.itemId,
        dto.warehouseId,
        item.qty,
      );

      // Get current MA for clearing amount calculation
      const currentMa = await this.maService.getCurrentMa(item.itemId, dto.warehouseId);
      const currentStock = await this.stockService.getStockBalance(item.itemId, dto.warehouseId);
      const itemClearingAmount = Math.round(item.qty * currentMa * 100) / 100;
      totalClearingAmount += itemClearingAmount;

      // Calculate stock-out (MA doesn't change on stock-out)
      const maResult = this.maService.calculateStockOut(currentStock, currentMa, item.qty);

      // Create TX log entry
      const txEntry = await this.txLogService.createTx({
        txType: TxType.GR_RETURN,
        txDate: new Date().toISOString(),
        period: currentPeriod,
        itemId: item.itemId,
        warehouseId: dto.warehouseId,
        qty: -item.qty, // negative for stock decrease
        unitCost: currentMa,
        totalCost: -itemClearingAmount,
        cogsUnit: null,
        vendorId: dto.vendorId,
        customerId: null,
        apAmount: 0,
        arAmount: 0,
        parentTxId: dto.refGrTxId,
        createdBy: userId,
        postedBy: null,
      });

      const postedTx = await this.txLogService.postTx(txEntry.txId, userId);
      txEntries.push(postedTx);
    }

    // 4. Open GR/IR Clearing (one clearing per return TX, using first item)
    const clearing = await this.clearingService.openClearing({
      grReturnTxId: txEntries[0].txId,
      grReceiveTxId: dto.refGrTxId,
      vendorId: dto.vendorId,
      itemId: dto.items[0].itemId,
      qty: dto.items[0].qty,
      clearingAmount: totalClearingAmount,
    });

    return {
      txEntry: {
        id: txEntries[0].txId,
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
    const currentPeriod = this.periodService.getCurrentPeriod();
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate clearing exists and is OPEN
    const clearing = await this.clearingService.findById(dto.clearingId);
    if (!clearing || clearing.status !== 'OPEN') {
      throw new ClearingNotOpenException(dto.clearingId);
    }

    // 3. Process each item — calculate MA and create TX
    const txEntries: TxLogEntry[] = [];

    for (const item of dto.items) {
      // Get current MA
      const currentMa = await this.maService.getCurrentMa(item.itemId, dto.warehouseId);
      const currentStock = await this.stockService.getStockBalance(item.itemId, dto.warehouseId);

      // Use clearing amount / qty as the unit cost for replacement
      const unitCost = Number(clearing.clearingAmount) / Number(clearing.qty);

      // Calculate new MA with replacement goods
      const maResult = this.maService.calculateMa({
        currentQty: currentStock,
        currentMa,
        qtyChange: item.qty,
        unitCost,
      });

      // Create TX log entry
      const txEntry = await this.txLogService.createTx({
        txType: TxType.GR_REPLACEMENT,
        txDate: new Date().toISOString(),
        period: currentPeriod,
        itemId: item.itemId,
        warehouseId: dto.warehouseId,
        qty: item.qty,
        unitCost,
        totalCost: Math.round(item.qty * unitCost * 100) / 100,
        cogsUnit: null,
        vendorId: clearing.vendorId,
        customerId: null,
        apAmount: 0,
        arAmount: 0,
        parentTxId: dto.refGrReturnTxId,
        createdBy: userId,
        postedBy: null,
      });

      const postedTx = await this.txLogService.postTx(txEntry.txId, userId);
      txEntries.push(postedTx);
    }

    // 4. Close clearing by replacement (PPV = 0)
    const closedClearing = await this.clearingService.closeByReplacement(
      dto.clearingId,
      txEntries[0].txId,
    );

    return {
      txEntry: {
        id: txEntries[0].txId,
        txType: TxType.GR_REPLACEMENT,
        status: 'POSTED',
        maBefore: txEntries[0].maBefore,
        maAfter: txEntries[0].maAfter,
      },
      clearing: {
        id: closedClearing.id,
        status: closedClearing.status,
        ppvAmount: Number(closedClearing.ppvAmount ?? 0),
      },
    };
  }
}
