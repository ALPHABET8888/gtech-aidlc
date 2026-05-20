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
  CreateSalesReturnDto,
  ReturnCondition,
  CreateSalesPriceAdjDto,
} from '../dto/sales';
import { ArService } from '../ap-ar/ar.service';
import { ReturnQtyExceededException } from '../exceptions';

export interface SalesCnReturnResult {
  txEntry: {
    id: string;
    txType: string;
    status: string;
  };
  arReduction: {
    openItemId: string;
    reducedAmount: number;
    newStatus: string;
  };
}

export interface SalesCnPriceAdjResult {
  txEntry: {
    id: string;
    txType: string;
    status: string;
  };
  arReduction: {
    openItemId: string;
    reducedAmount: number;
  };
}

/**
 * SalesCnService — handles Sales Credit Note transactions:
 *
 * CN_SALES_RETURN: stock return (good) or loss (damaged_total), AR reduction, VAT reversal
 * CN_SALES_PRICE: AR reduction only, no inventory impact, requires reason + Manager approval (DRAFT→POSTED)
 *
 * Stories: US-012, US-013
 */
@Injectable()
export class SalesCnService {
  constructor(
    @Inject('ITxLogService')
    private readonly txLogService: ITxLogService,
    @Inject('IMaCalculationService')
    private readonly maService: IMaCalculationService,
    @Inject('IStockValidationService')
    private readonly stockService: IStockValidationService,
    @Inject('IPeriodService')
    private readonly periodService: IPeriodService,
    private readonly arService: ArService,
  ) {}

  /**
   * Create CN_SALES_RETURN — Credit Note for sales return.
   *
   * Business rules:
   * - condition='good': stock returns to warehouse (stock increase + MA recalculation)
   * - condition='damaged_total': stock goes to loss (no stock increase, no MA recalc)
   * - Both conditions reduce the AR Open Item
   * - VAT reversal included in AR reduction
   * - Return qty must not exceed original sale qty
   *
   * Stories: US-012
   */
  async createSalesReturn(dto: CreateSalesReturnDto, userId: string): Promise<SalesCnReturnResult> {
    // 1. Validate period
    const currentPeriod = this.periodService.getCurrentPeriod();
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate the referenced invoice TX exists
    const refInvoiceTx = await this.txLogService.findById(dto.refInvoiceTxId);
    if (!refInvoiceTx) {
      throw new Error(`Referenced invoice transaction ${dto.refInvoiceTxId} not found`);
    }

    // 3. Validate return qty does not exceed original sale qty
    const totalReturnQty = dto.items.reduce((sum, item) => sum + item.qty, 0);
    const originalQty = Math.abs(refInvoiceTx.qty);
    if (totalReturnQty > originalQty) {
      throw new ReturnQtyExceededException(
        dto.items[0].itemId,
        totalReturnQty,
        originalQty,
      );
    }

    // 4. Determine stock and cost impact based on condition
    const firstItem = dto.items[0];
    const warehouseId = firstItem.warehouseId;
    const cogsUnit = refInvoiceTx.cogsUnit ?? 0;
    const totalCost = cogsUnit * totalReturnQty;

    let txEntry: TxLogEntry;

    if (dto.condition === ReturnCondition.GOOD) {
      // Good condition: stock returns to warehouse → stock increase + MA recalculation
      const currentStock = await this.stockService.getStockBalance(firstItem.itemId, warehouseId);
      const currentMa = await this.maService.getCurrentMa(firstItem.itemId, warehouseId);

      // MA recalculation for stock-in at original COGS unit cost
      await this.maService.calculateNewMa(
        firstItem.itemId,
        warehouseId,
        totalReturnQty,
        totalReturnQty * cogsUnit,
        true, // stock increase
      );

      // Create TX log entry — stock increase (positive qty)
      txEntry = await this.txLogService.createTx({
        txType: TxType.CN_SALES_RETURN,
        txDate: new Date().toISOString(),
        period: currentPeriod,
        itemId: firstItem.itemId,
        warehouseId,
        qty: totalReturnQty, // stock-in (positive)
        unitCost: cogsUnit,
        totalCost,
        cogsUnit,
        vendorId: null,
        customerId: refInvoiceTx.customerId,
        apAmount: 0,
        arAmount: -totalCost, // AR reduction (negative = reduce AR)
        parentTxId: dto.refInvoiceTxId,
        createdBy: userId,
        postedBy: null,
      });
    } else {
      // Damaged/total loss: stock goes to loss — no stock increase, no MA recalc
      txEntry = await this.txLogService.createTx({
        txType: TxType.CN_SALES_RETURN,
        txDate: new Date().toISOString(),
        period: currentPeriod,
        itemId: firstItem.itemId,
        warehouseId: null, // No warehouse impact for damaged goods
        qty: 0, // No stock increase
        unitCost: cogsUnit,
        totalCost: 0, // No inventory value change
        cogsUnit,
        vendorId: null,
        customerId: refInvoiceTx.customerId,
        apAmount: 0,
        arAmount: -totalCost, // AR reduction
        parentTxId: dto.refInvoiceTxId,
        createdBy: userId,
        postedBy: null,
      });
    }

    // 5. Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // 6. Find the AR Open Item linked to the original invoice
    const arItem = await this.arService.findByTxId(dto.refInvoiceTxId);
    if (!arItem) {
      throw new Error(`AR Open Item for invoice ${dto.refInvoiceTxId} not found`);
    }

    // 7. Reduce the AR Open Item
    const updatedArItem = await this.arService.reduceArByCn(arItem.id, totalCost);

    return {
      txEntry: {
        id: postedTx.txId,
        txType: TxType.CN_SALES_RETURN,
        status: 'POSTED',
      },
      arReduction: {
        openItemId: updatedArItem.id,
        reducedAmount: totalCost,
        newStatus: updatedArItem.status,
      },
    };
  }

  /**
   * Create CN_SALES_PRICE — Credit Note for sales price adjustment.
   *
   * Business rules:
   * - AR reduction only — no inventory impact
   * - Requires a reason
   * - Requires Manager approval (status starts as DRAFT, not POSTED)
   * - No stock movement, no MA recalculation
   *
   * Stories: US-013
   */
  async createSalesPriceAdj(dto: CreateSalesPriceAdjDto, userId: string): Promise<SalesCnPriceAdjResult> {
    // 1. Validate period
    const currentPeriod = this.periodService.getCurrentPeriod();
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate the referenced invoice TX exists
    const refInvoiceTx = await this.txLogService.findById(dto.refInvoiceTxId);
    if (!refInvoiceTx) {
      throw new Error(`Referenced invoice transaction ${dto.refInvoiceTxId} not found`);
    }

    // 3. Create TX log entry — AR reduction only, no inventory
    // CN_SALES_PRICE starts as DRAFT (requires Manager approval to POST)
    const txEntry = await this.txLogService.createTx({
      txType: TxType.CN_SALES_PRICE,
      txDate: new Date().toISOString(),
      period: currentPeriod,
      itemId: null, // No item — price adjustment only
      warehouseId: null,
      qty: 0,
      unitCost: 0,
      totalCost: 0,
      cogsUnit: null,
      vendorId: null,
      customerId: refInvoiceTx.customerId,
      apAmount: 0,
      arAmount: -dto.adjustmentAmount, // AR reduction
      parentTxId: dto.refInvoiceTxId,
      createdBy: userId,
      postedBy: null,
    });

    // 4. CN_SALES_PRICE stays in DRAFT status (Manager must approve to POST)
    // Do NOT call postTx — it remains DRAFT until approved

    // 5. Find the AR Open Item linked to the original invoice
    const arItem = await this.arService.findByTxId(dto.refInvoiceTxId);
    if (!arItem) {
      throw new Error(`AR Open Item for invoice ${dto.refInvoiceTxId} not found`);
    }

    // 6. Reduce the AR Open Item (pre-reduce on creation, adjust if voided)
    const updatedArItem = await this.arService.reduceArByCn(arItem.id, dto.adjustmentAmount);

    return {
      txEntry: {
        id: txEntry.txId,
        txType: TxType.CN_SALES_PRICE,
        status: 'DRAFT', // Requires Manager approval
      },
      arReduction: {
        openItemId: updatedArItem.id,
        reducedAmount: dto.adjustmentAmount,
      },
    };
  }
}
