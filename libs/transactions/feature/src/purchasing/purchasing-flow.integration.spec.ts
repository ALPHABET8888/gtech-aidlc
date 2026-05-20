import { Test, TestingModule } from '@nestjs/testing';
import { GoodsReceiptService } from './goods-receipt.service';
import { GrIrClearingService } from './gr-ir-clearing.service';
import { PurchaseCnService } from './purchase-cn.service';
import { ApService } from '../ap-ar/ap.service';
import { MasterDataMockModule } from '../mocks/master-data-mock.module';
import { MockTxLogService } from '../mocks/mock-tx-log.service';
import { MockMaCalculationService } from '../mocks/mock-ma-calculation.service';
import { MockStockValidationService } from '../mocks/mock-stock-validation.service';
import { MockPeriodService } from '../mocks/mock-period.service';
import { GrIrClearingRepository } from '@autoflow/transactions-data-access';
import { ApOpenItemRepository } from '@autoflow/transactions-data-access';
import { TxType } from '@autoflow/shared-types';
import { Prisma } from '@prisma/client';
import { ClearingNotOpenException } from '../exceptions';

/**
 * Integration tests for the full Purchasing flow.
 * Tests the interaction between GoodsReceiptService, PurchaseCnService,
 * GrIrClearingService, and ApService using the MasterDataMockModule
 * and in-memory repository mocks.
 *
 * Validates: design/correctness.md — Properties 5, 6
 * - Property 5: Clearing open/close consistency (close only once)
 * - Property 6: PPV calculation correctness
 */

// In-memory store for GR/IR Clearing
let clearingStore: Map<string, any>;
let clearingIdCounter: number;

// In-memory store for AP Open Items
let apStore: Map<string, any>;
let apIdCounter: number;

function createMockClearingRepo() {
  clearingStore = new Map();
  clearingIdCounter = 0;

  return {
    create: jest.fn(async (data: any) => {
      clearingIdCounter++;
      const id = `clearing-${clearingIdCounter}`;
      const record = {
        id,
        ...data,
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      };
      clearingStore.set(id, record);
      return record;
    }),
    findById: jest.fn(async (id: string) => {
      return clearingStore.get(id) ?? null;
    }),
    findByGrReturnTxId: jest.fn(async (grReturnTxId: string) => {
      for (const record of clearingStore.values()) {
        if (record.grReturnTxId === grReturnTxId) return record;
      }
      return null;
    }),
    close: jest.fn(async (id: string, closedByTxId: string, closedByType: string, ppvAmount?: Prisma.Decimal) => {
      const record = clearingStore.get(id);
      if (!record) throw new Error(`Clearing ${id} not found`);
      const updated = {
        ...record,
        status: 'CLOSED',
        closedByTxId,
        closedByType,
        ppvAmount: ppvAmount ?? null,
        closedAt: new Date(),
      };
      clearingStore.set(id, updated);
      return updated;
    }),
    findMany: jest.fn(async () => ({ data: [...clearingStore.values()], total: clearingStore.size })),
    findOpenByVendor: jest.fn(async (vendorId: string) => {
      return [...clearingStore.values()].filter(c => c.vendorId === vendorId && c.status === 'OPEN');
    }),
  };
}

function createMockApRepo() {
  apStore = new Map();
  apIdCounter = 0;

  return {
    create: jest.fn(async (data: any) => {
      apIdCounter++;
      const id = `ap-${apIdCounter}`;
      const record = {
        id,
        ...data,
        allocations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apStore.set(id, record);
      return record;
    }),
    findById: jest.fn(async (id: string) => {
      return apStore.get(id) ?? null;
    }),
    findByTxId: jest.fn(async (txId: string) => {
      for (const record of apStore.values()) {
        if (record.txId === txId) return record;
      }
      return null;
    }),
    findMany: jest.fn(async () => ({ data: [...apStore.values()], total: apStore.size })),
    findOpenByVendor: jest.fn(async (vendorId: string) => {
      return [...apStore.values()].filter(a => a.vendorId === vendorId && a.status !== 'CLOSED');
    }),
    update: jest.fn(async (id: string, data: any) => {
      const record = apStore.get(id);
      if (!record) throw new Error(`AP ${id} not found`);
      const updated = { ...record, ...data, updatedAt: new Date() };
      apStore.set(id, updated);
      return updated;
    }),
    updateRemainingAndStatus: jest.fn(async (id: string, remainingAmount: Prisma.Decimal, status: string) => {
      const record = apStore.get(id);
      if (!record) throw new Error(`AP ${id} not found`);
      const updated = { ...record, remainingAmount, status, updatedAt: new Date() };
      apStore.set(id, updated);
      return updated;
    }),
  };
}

describe('Purchasing Flow Integration Tests', () => {
  let goodsReceiptService: GoodsReceiptService;
  let purchaseCnService: PurchaseCnService;
  let clearingService: GrIrClearingService;
  let apService: ApService;
  let txLogService: MockTxLogService;
  let maService: MockMaCalculationService;
  let stockService: MockStockValidationService;
  let periodService: MockPeriodService;

  const userId = 'user-integration-test';
  const vendorId = '11111111-1111-1111-1111-111111111111';
  const itemId = '22222222-2222-2222-2222-222222222222';
  const warehouseId = '33333333-3333-3333-3333-333333333333';

  let mockClearingRepo: ReturnType<typeof createMockClearingRepo>;
  let mockApRepo: ReturnType<typeof createMockApRepo>;

  beforeEach(async () => {
    mockClearingRepo = createMockClearingRepo();
    mockApRepo = createMockApRepo();

    const module: TestingModule = await Test.createTestingModule({
      imports: [MasterDataMockModule],
      providers: [
        GoodsReceiptService,
        GrIrClearingService,
        PurchaseCnService,
        ApService,
        { provide: GrIrClearingRepository, useValue: mockClearingRepo },
        { provide: ApOpenItemRepository, useValue: mockApRepo },
      ],
    }).compile();

    goodsReceiptService = module.get<GoodsReceiptService>(GoodsReceiptService);
    purchaseCnService = module.get<PurchaseCnService>(PurchaseCnService);
    clearingService = module.get<GrIrClearingService>(GrIrClearingService);
    apService = module.get<ApService>(ApService);
    // Get mock services from the MasterDataMockModule
    txLogService = module.get<MockTxLogService>('ITxLogService');
    maService = module.get<MockMaCalculationService>('IMaCalculationService');
    stockService = module.get<MockStockValidationService>('IStockValidationService');
    periodService = module.get<MockPeriodService>('IPeriodService');

    // Configure mock services for integration tests
    maService.setMa(itemId, warehouseId, 100);
    stockService.setStockBalance(itemId, warehouseId, 500);
  });

  // ─── FULL FLOW: GR_RECEIVE → GR_RETURN → CN_RETURN ─────────────────────────

  describe('Full flow: GR_RECEIVE → GR_RETURN → CN_RETURN (with PPV)', () => {
    it('should complete the full purchasing return flow with CN', async () => {
      // Step 1: GR_RECEIVE — receive 100 units at 50 THB + 5 THB landed cost
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-001',
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 50, landedCost: 5 }],
          period: '2025-01',
        },
        userId,
      );

      expect(grResult.txEntry.txType).toBe(TxType.GR_RECEIVE);
      expect(grResult.txEntry.status).toBe('POSTED');
      expect(grResult.apOpenItem.status).toBe('OPEN');

      // Step 2: GR_RETURN — return 10 units (defective)
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 10 }],
          reason: 'Defective goods',
        },
        userId,
      );

      expect(returnResult.txEntry.txType).toBe(TxType.GR_RETURN);
      expect(returnResult.txEntry.status).toBe('POSTED');
      expect(returnResult.clearing.status).toBe('OPEN');
      // Clearing amount = qty * MA = 10 * 100 = 1000
      expect(returnResult.clearing.clearingAmount).toBe(1000);

      // Step 3: CN_RETURN — credit note closes the clearing
      const cnResult = await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      expect(cnResult.txEntry.txType).toBe(TxType.CN_RETURN);
      expect(cnResult.txEntry.status).toBe('POSTED');
      expect(cnResult.clearing.status).toBe('CLOSED');
      // PPV = clearingAmount - cnAmount = 1000 - 1000 = 0
      expect(cnResult.clearing.ppvAmount).toBe(0);
      // AP should be reduced
      expect(cnResult.apReduction.reducedAmount).toBe(1000);
    });

    it('should calculate PPV correctly when CN amount differs from clearing amount', async () => {
      // Configure MA at 120 for this test (simulating MA changed between GR and return)
      maService.setMa(itemId, warehouseId, 120);

      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-002',
          warehouseId,
          items: [{ itemId, qty: 50, unitCost: 100, landedCost: 20 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN — return 5 units
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 5 }],
          reason: 'Wrong specification',
        },
        userId,
      );

      // Clearing amount = 5 * MA(120) = 600
      expect(returnResult.clearing.clearingAmount).toBe(600);

      // Step 3: CN_RETURN — CN amount = clearing amount (600)
      // PPV = clearingAmount - cnAmount = 600 - 600 = 0
      const cnResult = await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      expect(cnResult.clearing.status).toBe('CLOSED');
      expect(cnResult.clearing.ppvAmount).toBe(0);
    });
  });

  // ─── FULL FLOW: GR_RECEIVE → GR_RETURN → GR_REPLACEMENT ────────────────────

  describe('Full flow: GR_RECEIVE → GR_RETURN → GR_REPLACEMENT', () => {
    it('should complete the full replacement flow', async () => {
      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-003',
          warehouseId,
          items: [{ itemId, qty: 200, unitCost: 80, landedCost: 10 }],
          period: '2025-01',
        },
        userId,
      );

      expect(grResult.txEntry.txType).toBe(TxType.GR_RECEIVE);

      // Step 2: GR_RETURN — return 20 units
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 20 }],
          reason: 'Damaged in transit',
        },
        userId,
      );

      expect(returnResult.clearing.status).toBe('OPEN');
      // Clearing amount = 20 * MA(100) = 2000
      expect(returnResult.clearing.clearingAmount).toBe(2000);

      // Step 3: GR_REPLACEMENT — receive replacement goods
      const replacementResult = await goodsReceiptService.receiveReplacement(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
          warehouseId,
          items: [{ itemId, qty: 20 }],
        },
        userId,
      );

      expect(replacementResult.txEntry.txType).toBe(TxType.GR_REPLACEMENT);
      expect(replacementResult.txEntry.status).toBe('POSTED');
      expect(replacementResult.clearing.status).toBe('CLOSED');
      // PPV = 0 for replacement (same goods returned)
      expect(replacementResult.clearing.ppvAmount).toBe(0);
    });

    it('should use clearing amount / qty as unit cost for replacement', async () => {
      // Configure MA at 150
      maService.setMa(itemId, warehouseId, 150);

      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-004',
          warehouseId,
          items: [{ itemId, qty: 30, unitCost: 140, landedCost: 10 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN — return 10 units
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 10 }],
          reason: 'Wrong items',
        },
        userId,
      );

      // Clearing amount = 10 * MA(150) = 1500
      expect(returnResult.clearing.clearingAmount).toBe(1500);

      // Step 3: GR_REPLACEMENT
      const replacementResult = await goodsReceiptService.receiveReplacement(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
          warehouseId,
          items: [{ itemId, qty: 10 }],
        },
        userId,
      );

      // Verify the TX was created (unit cost = clearingAmount/qty = 1500/10 = 150)
      expect(replacementResult.txEntry.status).toBe('POSTED');
      expect(replacementResult.clearing.status).toBe('CLOSED');
      expect(replacementResult.clearing.ppvAmount).toBe(0);
    });
  });

  // ─── CLEARING LIFECYCLE TESTS ───────────────────────────────────────────────

  describe('Clearing lifecycle (open → close)', () => {
    it('should not allow closing a clearing that is already CLOSED (by CN)', async () => {
      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-005',
          warehouseId,
          items: [{ itemId, qty: 50, unitCost: 60, landedCost: 0 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 5 }],
          reason: 'Quality issue',
        },
        userId,
      );

      // Step 3: Close by CN_RETURN
      await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      // Step 4: Attempt to close again by replacement — should throw
      await expect(
        goodsReceiptService.receiveReplacement(
          {
            refGrReturnTxId: returnResult.txEntry.id,
            clearingId: returnResult.clearing.id,
            warehouseId,
            items: [{ itemId, qty: 5 }],
          },
          userId,
        ),
      ).rejects.toThrow(ClearingNotOpenException);
    });

    it('should not allow closing a clearing that is already CLOSED (by replacement)', async () => {
      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-006',
          warehouseId,
          items: [{ itemId, qty: 40, unitCost: 75, landedCost: 5 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 8 }],
          reason: 'Expired goods',
        },
        userId,
      );

      // Step 3: Close by replacement
      await goodsReceiptService.receiveReplacement(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
          warehouseId,
          items: [{ itemId, qty: 8 }],
        },
        userId,
      );

      // Step 4: Attempt to close again by CN_RETURN — should throw
      await expect(
        purchaseCnService.createCnReturn(
          {
            refGrReturnTxId: returnResult.txEntry.id,
            clearingId: returnResult.clearing.id,
          },
          userId,
        ),
      ).rejects.toThrow(ClearingNotOpenException);
    });

    it('should track clearing status transitions correctly', async () => {
      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-007',
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 90, landedCost: 10 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN — creates OPEN clearing
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 15 }],
          reason: 'Defective batch',
        },
        userId,
      );

      // Verify clearing is OPEN
      const openClearing = await clearingService.findById(returnResult.clearing.id);
      expect(openClearing).not.toBeNull();
      expect(openClearing!.status).toBe('OPEN');

      // Step 3: Close by CN_RETURN
      const cnResult = await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      // Verify clearing is now CLOSED
      const closedClearing = await clearingService.findById(returnResult.clearing.id);
      expect(closedClearing).not.toBeNull();
      expect(closedClearing!.status).toBe('CLOSED');
      expect(closedClearing!.closedByType).toBe('CN_RETURN');
    });
  });

  // ─── PPV CALCULATION TESTS ──────────────────────────────────────────────────

  describe('PPV calculation correctness', () => {
    it('should calculate PPV = 0 when CN amount equals clearing amount', async () => {
      // MA = 100, so clearing = qty * 100
      // CN amount = clearing amount (full refund at MA)
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-008',
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 95, landedCost: 5 }],
          period: '2025-01',
        },
        userId,
      );

      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 10 }],
          reason: 'Test PPV zero',
        },
        userId,
      );

      const cnResult = await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      // PPV = clearingAmount - cnAmount = 1000 - 1000 = 0
      expect(cnResult.clearing.ppvAmount).toBe(0);
    });

    it('should calculate PPV = 0 for GR_REPLACEMENT (always zero)', async () => {
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-009',
          warehouseId,
          items: [{ itemId, qty: 80, unitCost: 110, landedCost: 0 }],
          period: '2025-01',
        },
        userId,
      );

      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 15 }],
          reason: 'Test PPV replacement',
        },
        userId,
      );

      const replacementResult = await goodsReceiptService.receiveReplacement(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
          warehouseId,
          items: [{ itemId, qty: 15 }],
        },
        userId,
      );

      // Replacement always has PPV = 0
      expect(replacementResult.clearing.ppvAmount).toBe(0);
    });
  });

  // ─── CN_RETURN INVENTORY PROTECTION ─────────────────────────────────────────

  describe('CN_RETURN inventory protection (must not touch inventory)', () => {
    it('should create CN_RETURN TX with qty=0, unitCost=0, totalCost=0', async () => {
      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-010',
          warehouseId,
          items: [{ itemId, qty: 60, unitCost: 45, landedCost: 5 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 10 }],
          reason: 'Test CN inventory protection',
        },
        userId,
      );

      // Step 3: CN_RETURN
      const cnResult = await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      // Verify the CN_RETURN TX has no inventory impact
      const cnTx = await txLogService.findById(cnResult.txEntry.id);
      expect(cnTx).not.toBeNull();
      expect(cnTx!.qty).toBe(0);
      expect(cnTx!.unitCost).toBe(0);
      expect(cnTx!.totalCost).toBe(0);
      expect(cnTx!.warehouseId).toBeNull();
    });

    it('should only reduce AP, not modify stock balance', async () => {
      // Record initial stock balance
      const initialStock = await stockService.getStockBalance(itemId, warehouseId);

      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-011',
          warehouseId,
          items: [{ itemId, qty: 25, unitCost: 80, landedCost: 0 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 5 }],
          reason: 'Test stock unchanged by CN',
        },
        userId,
      );

      // Record stock after GR_RETURN (stock decreased by return)
      const stockAfterReturn = await stockService.getStockBalance(itemId, warehouseId);

      // Step 3: CN_RETURN
      await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      // Stock should NOT change after CN_RETURN (CN doesn't touch inventory)
      const stockAfterCn = await stockService.getStockBalance(itemId, warehouseId);
      expect(stockAfterCn).toBe(stockAfterReturn);
    });

    it('should have negative apAmount in CN_RETURN TX (AP reduction)', async () => {
      // Step 1: GR_RECEIVE
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-012',
          warehouseId,
          items: [{ itemId, qty: 40, unitCost: 100, landedCost: 0 }],
          period: '2025-01',
        },
        userId,
      );

      // Step 2: GR_RETURN — return 8 units
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 8 }],
          reason: 'Test AP reduction',
        },
        userId,
      );

      // Step 3: CN_RETURN
      const cnResult = await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      // Verify the CN TX has negative apAmount (reducing AP)
      const cnTx = await txLogService.findById(cnResult.txEntry.id);
      expect(cnTx).not.toBeNull();
      expect(cnTx!.apAmount).toBeLessThan(0);
      // apAmount = -clearingAmount = -(8 * 100) = -800
      expect(cnTx!.apAmount).toBe(-800);
    });
  });

  // ─── AP OPEN ITEM LIFECYCLE IN PURCHASING FLOW ──────────────────────────────

  describe('AP Open Item lifecycle in purchasing flow', () => {
    it('should create AP on GR_RECEIVE and reduce on CN_RETURN', async () => {
      // Step 1: GR_RECEIVE — creates AP Open Item
      const grResult = await goodsReceiptService.createGoodsReceipt(
        {
          vendorId,
          taxInvoiceNo: 'TAX-2025-013',
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 50, landedCost: 0 }],
          period: '2025-01',
        },
        userId,
      );

      expect(grResult.apOpenItem.status).toBe('OPEN');
      // AP = (100 * 50) + 7% VAT = 5000 + 350 = 5350
      expect(grResult.apOpenItem.originalAmount).toBe(5350);

      // Step 2: GR_RETURN — return 10 units
      const returnResult = await goodsReceiptService.createGoodsReturn(
        {
          refGrTxId: grResult.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 10 }],
          reason: 'Test AP lifecycle',
        },
        userId,
      );

      // Step 3: CN_RETURN — reduces AP
      const cnResult = await purchaseCnService.createCnReturn(
        {
          refGrReturnTxId: returnResult.txEntry.id,
          clearingId: returnResult.clearing.id,
        },
        userId,
      );

      // AP should be reduced by clearing amount (10 * MA(100) = 1000)
      expect(cnResult.apReduction.reducedAmount).toBe(1000);
      // Status should be PARTIAL (5350 - 1000 = 4350 remaining)
      expect(cnResult.apReduction.newStatus).toBe('PARTIAL');
    });
  });
});
