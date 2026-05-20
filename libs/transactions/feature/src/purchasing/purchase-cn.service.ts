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
  CreateCnReturnDto,
  CreateCnPriceAdjDto,
  CreateCnDebtDto,
} from '../dto/purchasing';
import { ApService } from '../ap-ar/ap.service';
import { GrIrClearingService } from './gr-ir-clearing.service';
import { CnReturnInventoryException, ClearingNotOpenException } from '../exceptions';

/**
 * PurchaseCnService — handles Purchase Credit Note transactions:
 *
 * CN_RETURN: AP reduction + PPV calculation + clearing close (NO inventory impact)
 * CN_PRICE_ADJ: inventory value adjustment + AP reduction + MA recalculation
 * AP_CN_DEBT: AP reduction only (requires reason)
 */
@Injectable()
export class PurchaseCnService {
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
   * Create CN_RETURN — Credit Note from goods return.
   *
   * Business rules:
   * - Inherits references from GR_RETURN
   * - Calculates PPV = clearingAmount - cnAmount
   * - Closes the GR/IR Clearing
   * - Must NOT touch inventory (throws CnReturnInventoryException if attempted)
   * - Reduces AP Open Item
   *
   * Stories: US-018
   */
  async createCnReturn(dto: CreateCnReturnDto, userId: string) {
    // 1. Validate period
    const currentPeriod = this.periodService.getCurrentPeriod();
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate clearing exists and is OPEN
    const clearing = await this.clearingService.findById(dto.clearingId);
    if (!clearing || clearing.status !== 'OPEN') {
      throw new ClearingNotOpenException(dto.clearingId);
    }

    // 3. Validate the referenced GR_RETURN TX exists
    const refGrReturnTx = await this.txLogService.findById(dto.refGrReturnTxId);
    if (!refGrReturnTx) {
      throw new ClearingNotOpenException(dto.clearingId);
    }

    // 4. CN amount = clearing amount (full CN for the returned goods)
    const cnAmount = Number(clearing.clearingAmount);

    // 5. Create TX log entry — NO inventory fields (qty=0, unitCost=0)
    // CN_RETURN must NOT modify inventory
    const txEntry = await this.txLogService.createTx({
      txType: TxType.CN_RETURN,
      txDate: new Date().toISOString(),
      period: currentPeriod,
      itemId: clearing.itemId,
      warehouseId: null, // No warehouse impact — CN_RETURN doesn't touch inventory
      qty: 0, // NO inventory impact
      unitCost: 0,
      totalCost: 0,
      cogsUnit: null,
      vendorId: clearing.vendorId,
      customerId: null,
      apAmount: -cnAmount, // AP reduction (negative = reduce AP)
      arAmount: 0,
      parentTxId: dto.refGrReturnTxId,
      createdBy: userId,
      postedBy: null,
    });

    // 6. Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // 7. Close clearing by CN_RETURN (calculates PPV internally)
    const closedClearing = await this.clearingService.closeByCnReturn(
      dto.clearingId,
      postedTx.txId,
      cnAmount,
    );

    // 8. Find the AP Open Item linked to the original GR_RECEIVE
    const apItem = await this.apService.findByTxId(clearing.grReceiveTxId);
    if (!apItem) {
      throw new Error(`AP Open Item for GR ${clearing.grReceiveTxId} not found`);
    }

    // 9. Reduce the AP Open Item
    const updatedApItem = await this.apService.reduceApByCn(apItem.id, cnAmount);

    return {
      txEntry: {
        id: postedTx.txId,
        txType: TxType.CN_RETURN,
        status: 'POSTED',
      },
      apReduction: {
        openItemId: updatedApItem.id,
        reducedAmount: cnAmount,
        newStatus: updatedApItem.status,
      },
      clearing: {
        id: closedClearing.id,
        status: closedClearing.status,
        ppvAmount: Number(closedClearing.ppvAmount ?? 0),
      },
    };
  }

  /**
   * Create CN_PRICE_ADJ — Credit Note for price adjustment.
   *
   * Business rules:
   * - Checks remaining stock for the item
   * - Adjusts inventory value (reduces cost per unit)
   * - Reduces AP Open Item
   * - Recalculates MA based on remaining stock
   *
   * Stories: US-019
   */
  async createCnPriceAdj(dto: CreateCnPriceAdjDto, userId: string) {
    // 1. Validate period
    const currentPeriod = this.periodService.getCurrentPeriod();
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate the referenced GR TX exists
    const refGrTx = await this.txLogService.findById(dto.refGrTxId);
    if (!refGrTx) {
      throw new Error(`Referenced GR transaction ${dto.refGrTxId} not found`);
    }

    // 3. Get current stock and MA for the item
    const warehouseId = refGrTx.warehouseId!;
    const itemId = refGrTx.itemId!;
    const currentStock = await this.stockService.getStockBalance(itemId, warehouseId);
    const currentMa = await this.maService.getCurrentMa(itemId, warehouseId);

    // 4. Calculate total adjustment amount
    const totalAdjustment = Math.round(dto.adjustmentPerUnit * dto.qty * 100) / 100;

    // 5. Determine how much stock is still on hand vs already sold
    // remainingQty = min(currentStock, dto.qty) — can't adjust more than what's in stock
    const remainingQty = Math.min(currentStock, dto.qty);
    const soldQty = dto.qty - remainingQty;

    // 6. Calculate inventory impact (only for remaining stock)
    const inventoryAdjustment = Math.round(dto.adjustmentPerUnit * remainingQty * 100) / 100;
    const cogsAdjAmount = Math.round(dto.adjustmentPerUnit * soldQty * 100) / 100;

    // 7. Recalculate MA if there's remaining stock
    let maResult;
    if (remainingQty > 0) {
      // MA adjustment: reduce total value by inventory adjustment
      // New MA = (currentStock * currentMA - inventoryAdjustment) / currentStock
      maResult = await this.maService.calculateNewMa(
        itemId,
        warehouseId,
        0, // No qty change, just value adjustment
        inventoryAdjustment,
        false, // treat as decrease to reduce total value
      );
    }

    // 8. Create TX log entry
    const txEntry = await this.txLogService.createTx({
      txType: TxType.CN_PRICE_ADJ,
      txDate: new Date().toISOString(),
      period: currentPeriod,
      itemId,
      warehouseId,
      qty: 0, // No physical qty change
      unitCost: -dto.adjustmentPerUnit, // Negative = cost reduction
      totalCost: -totalAdjustment,
      cogsUnit: null,
      vendorId: refGrTx.vendorId,
      customerId: null,
      apAmount: -totalAdjustment, // AP reduction
      arAmount: 0,
      parentTxId: dto.refGrTxId,
      createdBy: userId,
      postedBy: null,
    });

    // 9. Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // 10. Find and reduce AP Open Item
    const apItem = await this.apService.findByTxId(dto.refGrTxId);
    if (!apItem) {
      throw new Error(`AP Open Item for GR ${dto.refGrTxId} not found`);
    }

    const updatedApItem = await this.apService.reduceApByCn(apItem.id, totalAdjustment);

    return {
      txEntry: {
        id: postedTx.txId,
        txType: TxType.CN_PRICE_ADJ,
        status: 'POSTED',
      },
      apReduction: {
        openItemId: updatedApItem.id,
        reducedAmount: totalAdjustment,
        newStatus: updatedApItem.status,
      },
      inventoryImpact: {
        remainingQty,
        soldQty,
        cogsAdjAmount,
      },
    };
  }

  /**
   * Create AP_CN_DEBT — Credit Note for AP debt reduction only.
   *
   * Business rules:
   * - AP reduction only — no inventory impact
   * - Requires a reason
   * - References an invoice/GR TX
   *
   * Stories: US-020
   */
  async createCnDebt(dto: CreateCnDebtDto, userId: string) {
    // 1. Validate period
    const currentPeriod = this.periodService.getCurrentPeriod();
    await this.periodService.validatePeriodOpen(currentPeriod);

    // 2. Validate the referenced TX exists
    const refTx = await this.txLogService.findById(dto.refInvoiceTxId);
    if (!refTx) {
      throw new Error(`Referenced transaction ${dto.refInvoiceTxId} not found`);
    }

    // 3. Create TX log entry — AP reduction only, no inventory
    const txEntry = await this.txLogService.createTx({
      txType: TxType.AP_CN_DEBT,
      txDate: new Date().toISOString(),
      period: currentPeriod,
      itemId: null, // No item — debt only
      warehouseId: null,
      qty: 0,
      unitCost: 0,
      totalCost: 0,
      cogsUnit: null,
      vendorId: refTx.vendorId,
      customerId: null,
      apAmount: -dto.amount, // AP reduction
      arAmount: 0,
      parentTxId: dto.refInvoiceTxId,
      createdBy: userId,
      postedBy: null,
    });

    // 4. Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // 5. Find and reduce AP Open Item
    const apItem = await this.apService.findByTxId(dto.refInvoiceTxId);
    if (!apItem) {
      throw new Error(`AP Open Item for TX ${dto.refInvoiceTxId} not found`);
    }

    const updatedApItem = await this.apService.reduceApByCn(apItem.id, dto.amount);

    return {
      txEntry: {
        id: postedTx.txId,
        txType: TxType.AP_CN_DEBT,
        status: 'POSTED',
      },
      apReduction: {
        openItemId: updatedApItem.id,
        reducedAmount: dto.amount,
        newStatus: updatedApItem.status,
      },
    };
  }
}
