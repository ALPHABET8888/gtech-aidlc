import { Injectable, Inject } from '@nestjs/common';
import { JobOrder, JOStatus } from '@prisma/client';
import { JobOrderRepository } from '@autoflow/transactions-data-access';
import {
  ITxLogService,
  IMaCalculationService,
  IStockValidationService,
  IPeriodService,
  TxLogEntry,
  TxType,
} from '@autoflow/shared-types';
import { ArService, CreateArOpenItemInput } from '../ap-ar/ar.service';
import { IssueTempDoDto } from '../dto/sales/issue-temp-do.dto';
import { IssueInvoiceDto } from '../dto/sales/issue-invoice.dto';
import {
  JoNotDoneException,
  DuplicateTempDoException,
  DuplicateInvoiceException,
} from '../exceptions';

export interface InvoiceResult {
  txEntry: TxLogEntry;
  arOpenItem: {
    id: string;
    status: string;
    originalAmount: number;
  };
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly jobOrderRepository: JobOrderRepository,
    private readonly arService: ArService,
    @Inject('ITxLogService')
    private readonly txLogService: ITxLogService,
    @Inject('IMaCalculationService')
    private readonly maCalculationService: IMaCalculationService,
    @Inject('IStockValidationService')
    private readonly stockValidationService: IStockValidationService,
    @Inject('IPeriodService')
    private readonly periodService: IPeriodService,
  ) {}

  /**
   * Issue TEMP_DO from a completed Job Order (Path A).
   * - Validates JO status = DONE
   * - Validates no duplicate TEMP_DO
   * - Validates stock availability for all items
   * - Validates period is open
   * - Creates TX Log entry (TEMP_DO)
   * - Creates AR Open Item (grandTotal from JO)
   * - Updates JO: hasTempDo = true, tempDoId = txId
   */
  async issueTempDO(joId: string, dto: IssueTempDoDto, userId: string): Promise<InvoiceResult> {
    const jobOrder = await this.getAndValidateJobOrder(joId);

    // Check no duplicate TEMP_DO
    if (jobOrder.hasTempDo) {
      throw new DuplicateTempDoException(joId);
    }

    const period = this.periodService.getCurrentPeriod();

    // Validate period is open
    await this.periodService.validatePeriodOpen(period);

    // Validate stock availability for all items
    for (const item of dto.items) {
      await this.stockValidationService.validateStockAvailable(
        item.itemId,
        dto.warehouseId,
        item.qty,
      );
    }

    // Calculate MA for stock-out (TEMP_DO delivers goods)
    const totalQty = dto.items.reduce((sum, item) => sum + item.qty, 0);
    const firstItem = dto.items[0];
    const currentMa = await this.maCalculationService.getCurrentMa(
      firstItem.itemId,
      dto.warehouseId,
    );
    const maResult = await this.maCalculationService.calculateNewMa(
      firstItem.itemId,
      dto.warehouseId,
      totalQty,
      totalQty * currentMa,
      false, // stock decrease
    );

    const grandTotal = Number(jobOrder.grandTotal);
    const vatAmount = Number(jobOrder.vatAmount);

    // Create TX Log entry
    const txEntry = await this.txLogService.createTx({
      txType: TxType.TEMP_DO,
      txDate: new Date().toISOString(),
      period,
      itemId: firstItem.itemId,
      warehouseId: dto.warehouseId,
      qty: -totalQty, // stock-out
      unitCost: currentMa,
      totalCost: -(totalQty * currentMa),
      cogsUnit: currentMa,
      vendorId: null,
      customerId: jobOrder.customerId,
      apAmount: 0,
      arAmount: grandTotal,
      parentTxId: null,
      createdBy: userId,
      postedBy: null,
    });

    // Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // Create AR Open Item
    const arInput: CreateArOpenItemInput = {
      customerId: jobOrder.customerId,
      txId: postedTx.txId,
      txType: TxType.TEMP_DO,
      originalAmount: grandTotal,
      vatAmount,
      period,
    };
    const arOpenItem = await this.arService.createArOpenItem(arInput);

    // Update JO: hasTempDo = true, tempDoId = txId
    await this.jobOrderRepository.update(joId, {
      hasTempDo: true,
      tempDoId: postedTx.txId,
    });

    return {
      txEntry: postedTx,
      arOpenItem: {
        id: arOpenItem.id,
        status: arOpenItem.status,
        originalAmount: Number(arOpenItem.originalAmount),
      },
    };
  }

  /**
   * Issue Invoice from a completed Job Order.
   * Auto-determines TX type:
   * - If hasTempDo = true → INVOICE_FROM_DO (financial only, qty=0, cost=0, ar=0)
   * - If hasTempDo = false → SALE_INVOICE (delivers goods + financial in one step)
   */
  async issueInvoice(joId: string, dto: IssueInvoiceDto, userId: string): Promise<InvoiceResult> {
    const jobOrder = await this.getAndValidateJobOrder(joId);

    // Check no duplicate invoice
    if (jobOrder.invoiceId) {
      throw new DuplicateInvoiceException(joId);
    }

    const period = this.periodService.getCurrentPeriod();

    // Validate period is open
    await this.periodService.validatePeriodOpen(period);

    const hasTempDo = jobOrder.hasTempDo;

    if (hasTempDo) {
      return this.issueInvoiceFromDo(jobOrder, dto, userId, period);
    } else {
      return this.issueSaleInvoice(jobOrder, dto, userId, period);
    }
  }

  /**
   * Path A continuation: INVOICE_FROM_DO
   * Financial document only — qty=0, cost=0, ar=0 (AR already created by TEMP_DO)
   */
  private async issueInvoiceFromDo(
    jobOrder: JobOrder,
    dto: IssueInvoiceDto,
    userId: string,
    period: string,
  ): Promise<InvoiceResult> {
    const taxInvoiceNo = this.generateTaxInvoiceNo();

    // INVOICE_FROM_DO: no stock impact, no AR impact (already handled by TEMP_DO)
    const txEntry = await this.txLogService.createTx({
      txType: TxType.INVOICE_FROM_DO,
      txDate: new Date().toISOString(),
      period,
      itemId: null,
      warehouseId: dto.warehouseId,
      qty: 0,
      unitCost: 0,
      totalCost: 0,
      cogsUnit: null,
      vendorId: null,
      customerId: jobOrder.customerId,
      apAmount: 0,
      arAmount: 0, // AR already created by TEMP_DO
      parentTxId: jobOrder.tempDoId,
      createdBy: userId,
      postedBy: null,
    });

    // Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // Update JO: invoiceId = txId
    await this.jobOrderRepository.update(jobOrder.id, {
      invoiceId: postedTx.txId,
    });

    // INVOICE_FROM_DO does not create a new AR Open Item (already exists from TEMP_DO)
    return {
      txEntry: { ...postedTx, taxInvoiceNo } as unknown as TxLogEntry,
      arOpenItem: {
        id: '', // No new AR item created
        status: 'EXISTING',
        originalAmount: 0,
      },
    };
  }

  /**
   * Path B: SALE_INVOICE
   * Delivers goods + creates financial document in one step.
   */
  private async issueSaleInvoice(
    jobOrder: JobOrder,
    dto: IssueInvoiceDto,
    userId: string,
    period: string,
  ): Promise<InvoiceResult> {
    // Validate stock availability for all items
    for (const item of dto.items) {
      await this.stockValidationService.validateStockAvailable(
        item.itemId,
        dto.warehouseId,
        item.qty,
      );
    }

    // Calculate MA for stock-out
    const totalQty = dto.items.reduce((sum, item) => sum + item.qty, 0);
    const firstItem = dto.items[0];
    const currentMa = await this.maCalculationService.getCurrentMa(
      firstItem.itemId,
      dto.warehouseId,
    );

    const grandTotal = Number(jobOrder.grandTotal);
    const vatAmount = Number(jobOrder.vatAmount);
    const taxInvoiceNo = this.generateTaxInvoiceNo();

    // Create TX Log entry (SALE_INVOICE: stock-out + AR)
    const txEntry = await this.txLogService.createTx({
      txType: TxType.SALE_INVOICE,
      txDate: new Date().toISOString(),
      period,
      itemId: firstItem.itemId,
      warehouseId: dto.warehouseId,
      qty: -totalQty, // stock-out
      unitCost: currentMa,
      totalCost: -(totalQty * currentMa),
      cogsUnit: currentMa,
      vendorId: null,
      customerId: jobOrder.customerId,
      apAmount: 0,
      arAmount: grandTotal,
      parentTxId: null,
      createdBy: userId,
      postedBy: null,
    });

    // Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // Create AR Open Item
    const arInput: CreateArOpenItemInput = {
      customerId: jobOrder.customerId,
      txId: postedTx.txId,
      txType: TxType.SALE_INVOICE,
      originalAmount: grandTotal,
      vatAmount,
      taxInvoiceNo,
      period,
    };
    const arOpenItem = await this.arService.createArOpenItem(arInput);

    // Update JO: invoiceId = txId
    await this.jobOrderRepository.update(jobOrder.id, {
      invoiceId: postedTx.txId,
    });

    return {
      txEntry: { ...postedTx, taxInvoiceNo } as unknown as TxLogEntry,
      arOpenItem: {
        id: arOpenItem.id,
        status: arOpenItem.status,
        originalAmount: Number(arOpenItem.originalAmount),
      },
    };
  }

  /**
   * Validate that the Job Order exists and is in DONE status.
   */
  private async getAndValidateJobOrder(joId: string): Promise<JobOrder> {
    const jobOrder = await this.jobOrderRepository.findById(joId);
    if (!jobOrder) {
      throw new JoNotDoneException(joId, 'NOT_FOUND');
    }

    if (jobOrder.status !== JOStatus.DONE) {
      throw new JoNotDoneException(joId, jobOrder.status);
    }

    return jobOrder;
  }

  /**
   * Generate a tax invoice number in format: INV-YYYYMM-NNNN
   */
  private generateTaxInvoiceNo(): string {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const timestamp = Date.now().toString().slice(-4);
    return `INV-${yearMonth}-${timestamp.padStart(4, '0')}`;
  }
}
