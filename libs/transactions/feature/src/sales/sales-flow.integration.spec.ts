import { Test, TestingModule } from '@nestjs/testing';
import { JobOrderService } from './job-order.service';
import { InvoiceService } from './invoice.service';
import { SalesCnService } from './sales-cn.service';
import { ArService } from '../ap-ar/ar.service';
import { MasterDataMockModule } from '../mocks/master-data-mock.module';
import { MockTxLogService } from '../mocks/mock-tx-log.service';
import { MockStockValidationService } from '../mocks/mock-stock-validation.service';
import { MockPeriodService } from '../mocks/mock-period.service';
import { MockMaCalculationService } from '../mocks/mock-ma-calculation.service';
import { JobOrderRepository } from '@autoflow/transactions-data-access';
import { ArOpenItemRepository } from '@autoflow/transactions-data-access';
import { JOStatus, CreateJobOrderDto, UpdateJoStatusDto } from '../dto';
import { ReturnCondition } from '../dto/sales';
import { TxType } from '@autoflow/shared-types';
import {
  JoNotDoneException,
  DuplicateTempDoException,
  DuplicateInvoiceException,
  ReturnQtyExceededException,
} from '../exceptions';
import { JOStatus as PrismaJOStatus, ApArStatus, Prisma } from '@prisma/client';

/**
 * Integration tests for the full Sales flow.
 *
 * Tests the complete lifecycle:
 * - Path A: JO → TEMP_DO → INVOICE_FROM_DO
 * - Path B: JO → SALE_INVOICE
 * - CN flows: CN_SALES_RETURN, CN_SALES_PRICE
 *
 * Uses MasterDataMockModule for TX Log, MA, Stock, Period services.
 * Uses in-memory mock repositories for JobOrder and AR Open Items.
 *
 * Validates: Properties 4, 7, 8 from design/correctness.md
 */
describe('Sales Flow Integration', () => {
  let module: TestingModule;
  let jobOrderService: JobOrderService;
  let invoiceService: InvoiceService;
  let salesCnService: SalesCnService;
  let arService: ArService;
  let txLogService: MockTxLogService;
  let stockService: MockStockValidationService;
  let periodService: MockPeriodService;
  let maService: MockMaCalculationService;
  let jobOrderRepo: jest.Mocked<JobOrderRepository>;
  let arOpenItemRepo: jest.Mocked<ArOpenItemRepository>;

  // In-memory store for job orders
  const jobOrderStore: Map<string, any> = new Map();
  // In-memory store for AR open items
  const arOpenItemStore: Map<string, any> = new Map();

  const userId = 'user-integration-001';
  const customerId = 'customer-int-001';
  const itemId = 'item-int-001';
  const warehouseId = 'wh-int-001';

  beforeEach(async () => {
    jobOrderStore.clear();
    arOpenItemStore.clear();

    // Create mock repositories that use in-memory stores
    const mockJobOrderRepo = {
      create: jest.fn().mockImplementation((data: any) => {
        const id = `jo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const jo = {
          id,
          ...data,
          items: data.items,
          totalAmount: new Prisma.Decimal(data.totalAmount),
          vatAmount: new Prisma.Decimal(data.vatAmount),
          grandTotal: new Prisma.Decimal(data.grandTotal),
          tempDoId: null,
          invoiceId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        jobOrderStore.set(id, jo);
        return Promise.resolve(jo);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(jobOrderStore.get(id) ?? null);
      }),
      findMany: jest.fn().mockImplementation((options: any) => {
        const data = Array.from(jobOrderStore.values());
        return Promise.resolve({ data, total: data.length });
      }),
      updateStatus: jest.fn().mockImplementation((id: string, status: any) => {
        const jo = jobOrderStore.get(id);
        if (!jo) return Promise.resolve(null);
        jo.status = status;
        jo.updatedAt = new Date();
        jobOrderStore.set(id, jo);
        return Promise.resolve(jo);
      }),
      update: jest.fn().mockImplementation((id: string, data: any) => {
        const jo = jobOrderStore.get(id);
        if (!jo) return Promise.resolve(null);
        Object.assign(jo, data);
        jo.updatedAt = new Date();
        jobOrderStore.set(id, jo);
        return Promise.resolve(jo);
      }),
      findByJoNumber: jest.fn().mockImplementation((joNumber: string) => {
        for (const jo of jobOrderStore.values()) {
          if (jo.joNumber === joNumber) return Promise.resolve(jo);
        }
        return Promise.resolve(null);
      }),
    };

    const mockArOpenItemRepo = {
      create: jest.fn().mockImplementation((data: any) => {
        const id = `ar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const item = {
          id,
          ...data,
          remainingAmount: data.remainingAmount ?? data.originalAmount,
          createdAt: new Date(),
          updatedAt: new Date(),
          allocations: [],
        };
        arOpenItemStore.set(id, item);
        return Promise.resolve(item);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(arOpenItemStore.get(id) ?? null);
      }),
      findByTxId: jest.fn().mockImplementation((txId: string) => {
        for (const item of arOpenItemStore.values()) {
          if (item.txId === txId) return Promise.resolve(item);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => {
        const data = Array.from(arOpenItemStore.values());
        return Promise.resolve({ data, total: data.length });
      }),
      findOpenByCustomer: jest.fn().mockImplementation((custId: string) => {
        const items = Array.from(arOpenItemStore.values())
          .filter(i => i.customerId === custId && i.status !== 'CLOSED');
        return Promise.resolve(items);
      }),
      update: jest.fn().mockImplementation((id: string, data: any) => {
        const item = arOpenItemStore.get(id);
        if (!item) return Promise.resolve(null);
        Object.assign(item, data);
        arOpenItemStore.set(id, item);
        return Promise.resolve(item);
      }),
      updateRemainingAndStatus: jest.fn().mockImplementation(
        (id: string, remainingAmount: any, status: any) => {
          const item = arOpenItemStore.get(id);
          if (!item) return Promise.resolve(null);
          item.remainingAmount = remainingAmount;
          item.status = status;
          arOpenItemStore.set(id, item);
          return Promise.resolve(item);
        },
      ),
    };

    module = await Test.createTestingModule({
      imports: [MasterDataMockModule],
      providers: [
        JobOrderService,
        InvoiceService,
        SalesCnService,
        ArService,
        { provide: JobOrderRepository, useValue: mockJobOrderRepo },
        { provide: ArOpenItemRepository, useValue: mockArOpenItemRepo },
      ],
    }).compile();

    jobOrderService = module.get(JobOrderService);
    invoiceService = module.get(InvoiceService);
    salesCnService = module.get(SalesCnService);
    arService = module.get(ArService);
    txLogService = module.get('ITxLogService');
    stockService = module.get('IStockValidationService');
    periodService = module.get('IPeriodService');
    maService = module.get('IMaCalculationService');
    jobOrderRepo = module.get(JobOrderRepository);
    arOpenItemRepo = module.get(ArOpenItemRepository);
  });

  afterEach(async () => {
    await module.close();
  });

  /**
   * Helper: Create a JO and advance it to DONE status.
   */
  async function createDoneJobOrder(): Promise<any> {
    const dto: CreateJobOrderDto = {
      customerId,
      items: [{ itemId, qty: 5, unitPrice: 100, description: 'Test item' }],
      notes: 'Integration test JO',
    };
    const jo = await jobOrderService.createJobOrder(dto, userId);
    await jobOrderService.updateStatus(jo.id, { status: JOStatus.IN_PROGRESS });
    await jobOrderService.updateStatus(jo.id, { status: JOStatus.DONE });
    return jobOrderStore.get(jo.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JO State Machine Tests (Property 4)
  // ─────────────────────────────────────────────────────────────────────────

  describe('JO State Machine (Property 4)', () => {
    it('should allow valid transition: OPEN → IN_PROGRESS → DONE', async () => {
      const dto: CreateJobOrderDto = {
        customerId,
        items: [{ itemId, qty: 3, unitPrice: 200 }],
      };
      const jo = await jobOrderService.createJobOrder(dto, userId);
      expect(jobOrderStore.get(jo.id).status).toBe(PrismaJOStatus.OPEN);

      await jobOrderService.updateStatus(jo.id, { status: JOStatus.IN_PROGRESS });
      expect(jobOrderStore.get(jo.id).status).toBe(PrismaJOStatus.IN_PROGRESS);

      await jobOrderService.updateStatus(jo.id, { status: JOStatus.DONE });
      expect(jobOrderStore.get(jo.id).status).toBe(PrismaJOStatus.DONE);
    });

    it('should reject skip transition: OPEN → DONE', async () => {
      const dto: CreateJobOrderDto = {
        customerId,
        items: [{ itemId, qty: 1, unitPrice: 50 }],
      };
      const jo = await jobOrderService.createJobOrder(dto, userId);

      await expect(
        jobOrderService.updateStatus(jo.id, { status: JOStatus.DONE }),
      ).rejects.toThrow(/Invalid status transition/);
    });

    it('should reject reverse transition: IN_PROGRESS → OPEN', async () => {
      const dto: CreateJobOrderDto = {
        customerId,
        items: [{ itemId, qty: 1, unitPrice: 50 }],
      };
      const jo = await jobOrderService.createJobOrder(dto, userId);
      await jobOrderService.updateStatus(jo.id, { status: JOStatus.IN_PROGRESS });

      await expect(
        jobOrderService.updateStatus(jo.id, { status: JOStatus.OPEN }),
      ).rejects.toThrow(/Invalid status transition/);
    });

    it('should reject any transition from DONE (terminal state)', async () => {
      const jo = await createDoneJobOrder();

      await expect(
        jobOrderService.updateStatus(jo.id, { status: JOStatus.OPEN }),
      ).rejects.toThrow(/Invalid status transition/);

      await expect(
        jobOrderService.updateStatus(jo.id, { status: JOStatus.IN_PROGRESS }),
      ).rejects.toThrow(/Invalid status transition/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Path A: JO → TEMP_DO → INVOICE_FROM_DO (Properties 7, 8)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Path A: JO → TEMP_DO → INVOICE_FROM_DO', () => {
    it('should complete full Path A flow end-to-end', async () => {
      const jo = await createDoneJobOrder();

      // Issue TEMP_DO
      const tempDoResult = await invoiceService.issueTempDO(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      expect(tempDoResult.txEntry.txType).toBe(TxType.TEMP_DO);
      expect(tempDoResult.arOpenItem.status).toBe(ApArStatus.OPEN);
      expect(tempDoResult.arOpenItem.originalAmount).toBe(535); // 500 + 7% VAT

      // Verify JO updated
      const updatedJo = jobOrderStore.get(jo.id);
      expect(updatedJo.hasTempDo).toBe(true);
      expect(updatedJo.tempDoId).toBeDefined();

      // Issue INVOICE_FROM_DO
      const invoiceResult = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      // Property 8: INVOICE_FROM_DO zero invariant
      expect(invoiceResult.arOpenItem.status).toBe('EXISTING');
      expect(invoiceResult.arOpenItem.originalAmount).toBe(0);
    });

    it('should create AR Open Item on TEMP_DO (not on INVOICE_FROM_DO)', async () => {
      const jo = await createDoneJobOrder();

      // TEMP_DO creates AR
      const tempDoResult = await invoiceService.issueTempDO(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );
      expect(arOpenItemStore.size).toBe(1);

      // INVOICE_FROM_DO does NOT create another AR
      await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );
      expect(arOpenItemStore.size).toBe(1); // Still 1
    });

    it('should reject duplicate TEMP_DO for same JO', async () => {
      const jo = await createDoneJobOrder();

      await invoiceService.issueTempDO(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      await expect(
        invoiceService.issueTempDO(
          jo.id,
          { warehouseId, items: [{ itemId, qty: 5 }] },
          userId,
        ),
      ).rejects.toThrow(DuplicateTempDoException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Path B: JO → SALE_INVOICE (Property 7)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Path B: JO → SALE_INVOICE', () => {
    it('should complete full Path B flow end-to-end', async () => {
      const jo = await createDoneJobOrder();

      // Issue SALE_INVOICE directly (no TEMP_DO)
      const result = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      // Property 7: hasTempDo=false → SALE_INVOICE
      expect(result.arOpenItem.status).toBe(ApArStatus.OPEN);
      expect(result.arOpenItem.originalAmount).toBe(535); // 500 + 7% VAT

      // Verify JO updated with invoiceId
      const updatedJo = jobOrderStore.get(jo.id);
      expect(updatedJo.invoiceId).toBeDefined();
      expect(updatedJo.hasTempDo).toBe(false);
    });

    it('should create AR Open Item on SALE_INVOICE', async () => {
      const jo = await createDoneJobOrder();

      await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      expect(arOpenItemStore.size).toBe(1);
      const arItem = Array.from(arOpenItemStore.values())[0];
      expect(arItem.customerId).toBe(customerId);
      expect(arItem.txType).toBe(TxType.SALE_INVOICE);
    });

    it('should reject duplicate invoice for same JO', async () => {
      const jo = await createDoneJobOrder();

      await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      await expect(
        invoiceService.issueInvoice(
          jo.id,
          { warehouseId, items: [{ itemId, qty: 5 }] },
          userId,
        ),
      ).rejects.toThrow(DuplicateInvoiceException);
    });

    it('should reject invoice when JO is not DONE', async () => {
      const dto: CreateJobOrderDto = {
        customerId,
        items: [{ itemId, qty: 5, unitPrice: 100 }],
      };
      const jo = await jobOrderService.createJobOrder(dto, userId);

      await expect(
        invoiceService.issueInvoice(
          jo.id,
          { warehouseId, items: [{ itemId, qty: 5 }] },
          userId,
        ),
      ).rejects.toThrow(JoNotDoneException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invoice Path Determination (Property 7)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Invoice Path Determination (Property 7)', () => {
    it('should determine INVOICE_FROM_DO when hasTempDo=true', async () => {
      const jo = await createDoneJobOrder();

      // Issue TEMP_DO first
      await invoiceService.issueTempDO(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      // Now issue invoice — should be INVOICE_FROM_DO
      const result = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      // INVOICE_FROM_DO: no new AR, status=EXISTING
      expect(result.arOpenItem.status).toBe('EXISTING');
    });

    it('should determine SALE_INVOICE when hasTempDo=false', async () => {
      const jo = await createDoneJobOrder();

      // Issue invoice directly — should be SALE_INVOICE
      const result = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      // SALE_INVOICE: creates new AR
      expect(result.arOpenItem.status).toBe(ApArStatus.OPEN);
      expect(result.arOpenItem.originalAmount).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CN Flows: CN_SALES_RETURN + CN_SALES_PRICE
  // ─────────────────────────────────────────────────────────────────────────

  describe('CN_SALES_RETURN flow', () => {
    it('should process CN return (good condition) with AR reduction', async () => {
      const jo = await createDoneJobOrder();

      // Issue SALE_INVOICE first
      const invoiceResult = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      // Get the TX ID from the posted invoice
      const invoiceTxId = invoiceResult.txEntry.txId;

      // Create CN_SALES_RETURN
      const cnResult = await salesCnService.createSalesReturn(
        {
          refInvoiceTxId: invoiceTxId,
          condition: ReturnCondition.GOOD,
          items: [{ itemId, qty: 2, warehouseId }],
          reason: 'สินค้าชำรุด',
        },
        userId,
      );

      expect(cnResult.txEntry.txType).toBe(TxType.CN_SALES_RETURN);
      expect(cnResult.txEntry.status).toBe('POSTED');
      expect(cnResult.arReduction.reducedAmount).toBeGreaterThan(0);
    });

    it('should reject CN return when qty exceeds original sale qty', async () => {
      const jo = await createDoneJobOrder();

      const invoiceResult = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      const invoiceTxId = invoiceResult.txEntry.txId;

      // Try to return more than sold
      await expect(
        salesCnService.createSalesReturn(
          {
            refInvoiceTxId: invoiceTxId,
            condition: ReturnCondition.GOOD,
            items: [{ itemId, qty: 10, warehouseId }],
            reason: 'Return too many',
          },
          userId,
        ),
      ).rejects.toThrow(ReturnQtyExceededException);
    });

    it('should process CN return (damaged_total) without stock increase', async () => {
      const jo = await createDoneJobOrder();

      const invoiceResult = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      const invoiceTxId = invoiceResult.txEntry.txId;

      const cnResult = await salesCnService.createSalesReturn(
        {
          refInvoiceTxId: invoiceTxId,
          condition: ReturnCondition.DAMAGED_TOTAL,
          items: [{ itemId, qty: 3, warehouseId }],
          reason: 'สินค้าเสียหายทั้งหมด',
        },
        userId,
      );

      expect(cnResult.txEntry.txType).toBe(TxType.CN_SALES_RETURN);
      expect(cnResult.txEntry.status).toBe('POSTED');
    });
  });

  describe('CN_SALES_PRICE flow', () => {
    it('should create CN price adjustment with DRAFT status', async () => {
      const jo = await createDoneJobOrder();

      const invoiceResult = await invoiceService.issueInvoice(
        jo.id,
        { warehouseId, items: [{ itemId, qty: 5 }] },
        userId,
      );

      const invoiceTxId = invoiceResult.txEntry.txId;

      const cnResult = await salesCnService.createSalesPriceAdj(
        {
          refInvoiceTxId: invoiceTxId,
          adjustmentAmount: 50,
          reason: 'ส่วนลดพิเศษ',
        },
        userId,
      );

      expect(cnResult.txEntry.txType).toBe(TxType.CN_SALES_PRICE);
      expect(cnResult.txEntry.status).toBe('DRAFT'); // Requires Manager approval
      expect(cnResult.arReduction.reducedAmount).toBe(50);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Period Validation
  // ─────────────────────────────────────────────────────────────────────────

  describe('Period Validation', () => {
    it('should reject TEMP_DO when period is closed', async () => {
      const jo = await createDoneJobOrder();

      // Close the current period
      const currentPeriod = periodService.getCurrentPeriod();
      periodService.closePeriodMock(currentPeriod);

      await expect(
        invoiceService.issueTempDO(
          jo.id,
          { warehouseId, items: [{ itemId, qty: 5 }] },
          userId,
        ),
      ).rejects.toThrow(/is closed/);
    });

    it('should reject SALE_INVOICE when period is closed', async () => {
      const jo = await createDoneJobOrder();

      const currentPeriod = periodService.getCurrentPeriod();
      periodService.closePeriodMock(currentPeriod);

      await expect(
        invoiceService.issueInvoice(
          jo.id,
          { warehouseId, items: [{ itemId, qty: 5 }] },
          userId,
        ),
      ).rejects.toThrow(/is closed/);
    });
  });
});
