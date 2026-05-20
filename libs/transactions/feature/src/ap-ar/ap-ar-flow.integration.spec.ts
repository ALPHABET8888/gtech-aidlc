import { Test, TestingModule } from '@nestjs/testing';
import { ApArStatus, Prisma } from '@prisma/client';
import { ApService, CreateApOpenItemInput } from './ap.service';
import { ArService, CreateArOpenItemInput } from './ar.service';
import { PaymentMatchingService } from './payment-matching.service';
import { MasterDataMockModule } from '../mocks/master-data-mock.module';
import { MockTxLogService } from '../mocks/mock-tx-log.service';
import {
  ApOpenItemRepository,
  ArOpenItemRepository,
} from '@autoflow/transactions-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import { PaymentMethod } from '../dto/ap-ar';
import {
  OpenItemNotFoundException,
  PaymentExceedsBalanceException,
} from '../exceptions';
import { AllocationSumMismatchException } from '../exceptions/allocation-sum-mismatch.exception';

/**
 * Integration tests for the full AP/AR payment flow.
 *
 * Tests the complete lifecycle:
 * - Create AP/AR Open Items
 * - Partial payment → status PARTIAL
 * - CN reduction → reduce remaining
 * - Full payment → status CLOSED
 *
 * Uses MasterDataMockModule for TX Log service.
 * Uses in-memory mock repositories for AP/AR Open Items.
 *
 * Validates: Properties 1, 2, 3 from design/correctness.md
 */
describe('AP/AR Flow Integration', () => {
  let module: TestingModule;
  let apService: ApService;
  let arService: ArService;
  let paymentMatchingService: PaymentMatchingService;
  let txLogService: MockTxLogService;
  let apOpenItemRepo: jest.Mocked<ApOpenItemRepository>;
  let arOpenItemRepo: jest.Mocked<ArOpenItemRepository>;
  let prismaService: any;

  // In-memory stores
  const apStore: Map<string, any> = new Map();
  const arStore: Map<string, any> = new Map();

  const userId = 'user-integration-001';
  const vendorId = 'vendor-int-001';
  const customerId = 'customer-int-001';

  beforeEach(async () => {
    apStore.clear();
    arStore.clear();

    const mockApOpenItemRepo = {
      create: jest.fn().mockImplementation((data: any) => {
        const id = `ap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const item = {
          id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          allocations: [],
        };
        apStore.set(id, item);
        return Promise.resolve(item);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(apStore.get(id) ?? null);
      }),
      findByTxId: jest.fn().mockImplementation((txId: string) => {
        for (const item of apStore.values()) {
          if (item.txId === txId) return Promise.resolve(item);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation((options: any = {}) => {
        let data = Array.from(apStore.values());
        if (options.vendorId) {
          data = data.filter((i) => i.vendorId === options.vendorId);
        }
        if (options.status) {
          data = data.filter((i) => i.status === options.status);
        }
        return Promise.resolve({ data, total: data.length });
      }),
      findOpenByVendor: jest.fn().mockImplementation((vid: string) => {
        const items = Array.from(apStore.values()).filter(
          (i) => i.vendorId === vid && i.status !== 'CLOSED',
        );
        return Promise.resolve(items);
      }),
      update: jest.fn().mockImplementation((id: string, data: any) => {
        const item = apStore.get(id);
        if (!item) return Promise.resolve(null);
        Object.assign(item, data);
        apStore.set(id, item);
        return Promise.resolve(item);
      }),
      updateRemainingAndStatus: jest.fn().mockImplementation(
        (id: string, remainingAmount: any, status: any) => {
          const item = apStore.get(id);
          if (!item) return Promise.resolve(null);
          item.remainingAmount = remainingAmount;
          item.status = status;
          item.updatedAt = new Date();
          apStore.set(id, item);
          return Promise.resolve(item);
        },
      ),
    };

    const mockArOpenItemRepo = {
      create: jest.fn().mockImplementation((data: any) => {
        const id = `ar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const item = {
          id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          allocations: [],
        };
        arStore.set(id, item);
        return Promise.resolve(item);
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(arStore.get(id) ?? null);
      }),
      findByTxId: jest.fn().mockImplementation((txId: string) => {
        for (const item of arStore.values()) {
          if (item.txId === txId) return Promise.resolve(item);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation((options: any = {}) => {
        let data = Array.from(arStore.values());
        if (options.customerId) {
          data = data.filter((i) => i.customerId === options.customerId);
        }
        if (options.status) {
          data = data.filter((i) => i.status === options.status);
        }
        return Promise.resolve({ data, total: data.length });
      }),
      findOpenByCustomer: jest.fn().mockImplementation((cid: string) => {
        const items = Array.from(arStore.values()).filter(
          (i) => i.customerId === cid && i.status !== 'CLOSED',
        );
        return Promise.resolve(items);
      }),
      update: jest.fn().mockImplementation((id: string, data: any) => {
        const item = arStore.get(id);
        if (!item) return Promise.resolve(null);
        Object.assign(item, data);
        arStore.set(id, item);
        return Promise.resolve(item);
      }),
      updateRemainingAndStatus: jest.fn().mockImplementation(
        (id: string, remainingAmount: any, status: any) => {
          const item = arStore.get(id);
          if (!item) return Promise.resolve(null);
          item.remainingAmount = remainingAmount;
          item.status = status;
          item.updatedAt = new Date();
          arStore.set(id, item);
          return Promise.resolve(item);
        },
      ),
    };

    const mockPrismaService = {
      aPPaymentAllocation: {
        create: jest.fn().mockResolvedValue({ id: 'alloc-1' }),
      },
      aRPaymentAllocation: {
        create: jest.fn().mockResolvedValue({ id: 'alloc-1' }),
      },
    };

    module = await Test.createTestingModule({
      imports: [MasterDataMockModule],
      providers: [
        ApService,
        ArService,
        PaymentMatchingService,
        { provide: ApOpenItemRepository, useValue: mockApOpenItemRepo },
        { provide: ArOpenItemRepository, useValue: mockArOpenItemRepo },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    apService = module.get(ApService);
    arService = module.get(ArService);
    paymentMatchingService = module.get(PaymentMatchingService);
    txLogService = module.get('ITxLogService');
    apOpenItemRepo = module.get(ApOpenItemRepository);
    arOpenItemRepo = module.get(ArOpenItemRepository);
    prismaService = module.get(PrismaService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper functions
  // ─────────────────────────────────────────────────────────────────────────

  async function createApItem(amount: number): Promise<any> {
    const input: CreateApOpenItemInput = {
      vendorId,
      txId: `tx-ap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      txType: 'GR_RECEIVE',
      originalAmount: amount,
      vatAmount: amount * 0.07,
      taxInvoiceNo: `INV-${Date.now()}`,
      period: '2024-02',
    };
    return apService.createApOpenItem(input);
  }

  async function createArItem(amount: number): Promise<any> {
    const input: CreateArOpenItemInput = {
      customerId,
      txId: `tx-ar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      txType: 'SALE_INVOICE',
      originalAmount: amount,
      vatAmount: amount * 0.07,
      taxInvoiceNo: `SI-${Date.now()}`,
      period: '2024-02',
    };
    return arService.createArOpenItem(input);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AP Lifecycle: Create → Partial Pay → CN Reduce → Close (Property 1, 2)
  // ─────────────────────────────────────────────────────────────────────────

  describe('AP Full Lifecycle (Properties 1, 2)', () => {
    it('should complete full AP lifecycle: create → partial pay → CN reduce → close', async () => {
      // 1. Create AP Open Item (10,000 THB)
      const apItem = await createApItem(10000);
      expect(apItem.status).toBe(ApArStatus.OPEN);
      expect(Number(apItem.originalAmount)).toBe(10000);
      expect(Number(apItem.remainingAmount)).toBe(10000);

      // 2. Partial payment (3,000 THB) → status PARTIAL
      const paymentResult = await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 3000,
          allocations: [{ openItemId: apItem.id, amount: 3000 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      expect(paymentResult.txEntry.txType).toBe('AP_PAYMENT');
      expect(paymentResult.txEntry.status).toBe('POSTED');
      expect(paymentResult.allocations[0].newStatus).toBe(ApArStatus.PARTIAL);

      // Verify in-memory store updated
      const afterPayment = apStore.get(apItem.id);
      expect(Number(afterPayment.remainingAmount)).toBe(7000);
      expect(afterPayment.status).toBe(ApArStatus.PARTIAL);

      // 3. CN reduction (2,000 THB) → still PARTIAL
      const afterCn = await apService.reduceApByCn(apItem.id, 2000);
      expect(afterCn.status).toBe(ApArStatus.PARTIAL);
      expect(Number(afterCn.remainingAmount)).toBe(5000);

      // 4. Final payment (5,000 THB) → CLOSED
      const finalPayment = await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 5000,
          allocations: [{ openItemId: apItem.id, amount: 5000 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      expect(finalPayment.allocations[0].newStatus).toBe(ApArStatus.CLOSED);

      // Property 1: Balance invariant
      const finalItem = apStore.get(apItem.id);
      expect(Number(finalItem.remainingAmount)).toBe(0);

      // Property 2: Status consistency — remaining=0 → CLOSED
      expect(finalItem.status).toBe(ApArStatus.CLOSED);
    });

    it('should transition AP status correctly: OPEN → PARTIAL → CLOSED', async () => {
      const apItem = await createApItem(5000);
      expect(apItem.status).toBe(ApArStatus.OPEN);

      // Partial payment
      await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 2000,
          allocations: [{ openItemId: apItem.id, amount: 2000 }],
          paymentMethod: PaymentMethod.CHEQUE,
        },
        userId,
      );
      expect(apStore.get(apItem.id).status).toBe(ApArStatus.PARTIAL);

      // Full remaining payment
      await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 3000,
          allocations: [{ openItemId: apItem.id, amount: 3000 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );
      expect(apStore.get(apItem.id).status).toBe(ApArStatus.CLOSED);
    });

    it('should close AP item when CN reduction covers full remaining', async () => {
      const apItem = await createApItem(3000);

      // Partial payment
      await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 1000,
          allocations: [{ openItemId: apItem.id, amount: 1000 }],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );
      expect(apStore.get(apItem.id).status).toBe(ApArStatus.PARTIAL);

      // CN covers remaining 2000
      await apService.reduceApByCn(apItem.id, 2000);
      expect(apStore.get(apItem.id).status).toBe(ApArStatus.CLOSED);
      expect(Number(apStore.get(apItem.id).remainingAmount)).toBe(0);
    });

    it('should maintain balance invariant: remaining = original - payments - cnReductions', async () => {
      const apItem = await createApItem(10000);

      // Payment 1: 2500
      await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 2500,
          allocations: [{ openItemId: apItem.id, amount: 2500 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      // CN reduction: 1500
      await apService.reduceApByCn(apItem.id, 1500);

      // Payment 2: 3000
      await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 3000,
          allocations: [{ openItemId: apItem.id, amount: 3000 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      // Property 1: remaining = 10000 - 2500 - 1500 - 3000 = 3000
      const item = apStore.get(apItem.id);
      expect(Number(item.remainingAmount)).toBe(3000);
      expect(item.status).toBe(ApArStatus.PARTIAL);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AR Lifecycle: Create → Partial Pay → CN Reduce → Close (Property 1, 2)
  // ─────────────────────────────────────────────────────────────────────────

  describe('AR Full Lifecycle (Properties 1, 2)', () => {
    it('should complete full AR lifecycle: create → partial pay → CN reduce → close', async () => {
      // 1. Create AR Open Item (8,000 THB)
      const arItem = await createArItem(8000);
      expect(arItem.status).toBe(ApArStatus.OPEN);
      expect(Number(arItem.originalAmount)).toBe(8000);
      expect(Number(arItem.remainingAmount)).toBe(8000);

      // 2. Partial payment (3,000 THB) → status PARTIAL
      const paymentResult = await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 3000,
          allocations: [{ openItemId: arItem.id, amount: 3000 }],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );

      expect(paymentResult.txEntry.txType).toBe('AR_RECEIVE');
      expect(paymentResult.txEntry.status).toBe('POSTED');
      expect(paymentResult.allocations[0].newStatus).toBe(ApArStatus.PARTIAL);

      // Verify in-memory store updated
      const afterPayment = arStore.get(arItem.id);
      expect(Number(afterPayment.remainingAmount)).toBe(5000);
      expect(afterPayment.status).toBe(ApArStatus.PARTIAL);

      // 3. CN reduction (2,000 THB) → still PARTIAL
      const afterCn = await arService.reduceArByCn(arItem.id, 2000);
      expect(afterCn.status).toBe(ApArStatus.PARTIAL);
      expect(Number(afterCn.remainingAmount)).toBe(3000);

      // 4. Final payment (3,000 THB) → CLOSED
      const finalPayment = await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 3000,
          allocations: [{ openItemId: arItem.id, amount: 3000 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      expect(finalPayment.allocations[0].newStatus).toBe(ApArStatus.CLOSED);

      // Property 1: Balance invariant
      const finalItem = arStore.get(arItem.id);
      expect(Number(finalItem.remainingAmount)).toBe(0);

      // Property 2: Status consistency — remaining=0 → CLOSED
      expect(finalItem.status).toBe(ApArStatus.CLOSED);
    });

    it('should transition AR status correctly: OPEN → PARTIAL → CLOSED', async () => {
      const arItem = await createArItem(6000);
      expect(arItem.status).toBe(ApArStatus.OPEN);

      // Partial payment
      await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 4000,
          allocations: [{ openItemId: arItem.id, amount: 4000 }],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );
      expect(arStore.get(arItem.id).status).toBe(ApArStatus.PARTIAL);

      // Full remaining payment
      await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 2000,
          allocations: [{ openItemId: arItem.id, amount: 2000 }],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );
      expect(arStore.get(arItem.id).status).toBe(ApArStatus.CLOSED);
    });

    it('should close AR item when CN reduction covers full remaining', async () => {
      const arItem = await createArItem(5000);

      // Partial payment
      await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 2000,
          allocations: [{ openItemId: arItem.id, amount: 2000 }],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );
      expect(arStore.get(arItem.id).status).toBe(ApArStatus.PARTIAL);

      // CN covers remaining 3000
      await arService.reduceArByCn(arItem.id, 3000);
      expect(arStore.get(arItem.id).status).toBe(ApArStatus.CLOSED);
      expect(Number(arStore.get(arItem.id).remainingAmount)).toBe(0);
    });

    it('should maintain balance invariant: remaining = original - payments - cnReductions', async () => {
      const arItem = await createArItem(12000);

      // Payment 1: 4000
      await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 4000,
          allocations: [{ openItemId: arItem.id, amount: 4000 }],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );

      // CN reduction: 3000
      await arService.reduceArByCn(arItem.id, 3000);

      // Payment 2: 2000
      await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 2000,
          allocations: [{ openItemId: arItem.id, amount: 2000 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      // Property 1: remaining = 12000 - 4000 - 3000 - 2000 = 3000
      const item = arStore.get(arItem.id);
      expect(Number(item.remainingAmount)).toBe(3000);
      expect(item.status).toBe(ApArStatus.PARTIAL);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Payment Allocation Sum Validation (Property 3)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Payment Allocation Sum Validation (Property 3)', () => {
    it('should accept AP payment when allocation sum equals totalAmount exactly', async () => {
      const ap1 = await createApItem(5000);
      const ap2 = await createApItem(3000);

      const result = await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 4000,
          allocations: [
            { openItemId: ap1.id, amount: 2500 },
            { openItemId: ap2.id, amount: 1500 },
          ],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      // Sum of allocations = 2500 + 1500 = 4000 = totalAmount ✓
      expect(result.allocations).toHaveLength(2);
      expect(result.txEntry.status).toBe('POSTED');
    });

    it('should reject AP payment when allocation sum < totalAmount', async () => {
      const ap1 = await createApItem(5000);

      await expect(
        paymentMatchingService.makeApPayment(
          {
            vendorId,
            totalAmount: 5000,
            allocations: [{ openItemId: ap1.id, amount: 4000 }], // 4000 ≠ 5000
            paymentMethod: PaymentMethod.TRANSFER,
          },
          userId,
        ),
      ).rejects.toThrow(AllocationSumMismatchException);
    });

    it('should reject AP payment when allocation sum > totalAmount', async () => {
      const ap1 = await createApItem(5000);
      const ap2 = await createApItem(3000);

      await expect(
        paymentMatchingService.makeApPayment(
          {
            vendorId,
            totalAmount: 3000,
            allocations: [
              { openItemId: ap1.id, amount: 2000 },
              { openItemId: ap2.id, amount: 2000 }, // sum=4000 ≠ 3000
            ],
            paymentMethod: PaymentMethod.TRANSFER,
          },
          userId,
        ),
      ).rejects.toThrow(AllocationSumMismatchException);
    });

    it('should accept AR payment when allocation sum equals totalAmount exactly', async () => {
      const ar1 = await createArItem(4000);
      const ar2 = await createArItem(6000);

      const result = await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 7000,
          allocations: [
            { openItemId: ar1.id, amount: 4000 },
            { openItemId: ar2.id, amount: 3000 },
          ],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );

      // Sum of allocations = 4000 + 3000 = 7000 = totalAmount ✓
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0].newStatus).toBe(ApArStatus.CLOSED);
      expect(result.allocations[1].newStatus).toBe(ApArStatus.PARTIAL);
    });

    it('should reject AR payment when allocation sum does not match totalAmount', async () => {
      const ar1 = await createArItem(5000);

      await expect(
        paymentMatchingService.receiveArPayment(
          {
            customerId,
            totalAmount: 3000,
            allocations: [{ openItemId: ar1.id, amount: 2000 }], // 2000 ≠ 3000
            paymentMethod: PaymentMethod.CASH,
          },
          userId,
        ),
      ).rejects.toThrow(AllocationSumMismatchException);
    });

    it('should handle multi-item allocation with exact sum (no money leak)', async () => {
      const ar1 = await createArItem(1000);
      const ar2 = await createArItem(2000);
      const ar3 = await createArItem(3000);

      const result = await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 3500,
          allocations: [
            { openItemId: ar1.id, amount: 1000 },
            { openItemId: ar2.id, amount: 1500 },
            { openItemId: ar3.id, amount: 1000 },
          ],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      // Property 3: No money leak — sum(allocations) = totalAmount
      const allocSum = result.allocations.reduce((s, a) => s + a.amount, 0);
      expect(allocSum).toBe(3500);
      expect(result.allocations[0].newStatus).toBe(ApArStatus.CLOSED); // 1000/1000
      expect(result.allocations[1].newStatus).toBe(ApArStatus.PARTIAL); // 1500/2000
      expect(result.allocations[2].newStatus).toBe(ApArStatus.PARTIAL); // 1000/3000
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Status Transition Validation (Property 2)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Status Transition Validation (Property 2)', () => {
    it('should keep status OPEN when no payments or reductions applied', async () => {
      const apItem = await createApItem(5000);
      const arItem = await createArItem(8000);

      expect(apItem.status).toBe(ApArStatus.OPEN);
      expect(arItem.status).toBe(ApArStatus.OPEN);
      expect(Number(apItem.remainingAmount)).toBe(Number(apItem.originalAmount));
      expect(Number(arItem.remainingAmount)).toBe(Number(arItem.originalAmount));
    });

    it('should set PARTIAL when 0 < remaining < original (AP)', async () => {
      const apItem = await createApItem(10000);

      await apService.reduceApByCn(apItem.id, 1);
      const item = apStore.get(apItem.id);
      expect(item.status).toBe(ApArStatus.PARTIAL);
      expect(Number(item.remainingAmount)).toBe(9999);
    });

    it('should set PARTIAL when 0 < remaining < original (AR)', async () => {
      const arItem = await createArItem(10000);

      await arService.reduceArByCn(arItem.id, 1);
      const item = arStore.get(arItem.id);
      expect(item.status).toBe(ApArStatus.PARTIAL);
      expect(Number(item.remainingAmount)).toBe(9999);
    });

    it('should set CLOSED when remaining = 0 (AP via CN)', async () => {
      const apItem = await createApItem(500);

      await apService.reduceApByCn(apItem.id, 500);
      const item = apStore.get(apItem.id);
      expect(item.status).toBe(ApArStatus.CLOSED);
      expect(Number(item.remainingAmount)).toBe(0);
    });

    it('should set CLOSED when remaining = 0 (AR via CN)', async () => {
      const arItem = await createArItem(500);

      await arService.reduceArByCn(arItem.id, 500);
      const item = arStore.get(arItem.id);
      expect(item.status).toBe(ApArStatus.CLOSED);
      expect(Number(item.remainingAmount)).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error Handling in Payment Flow
  // ─────────────────────────────────────────────────────────────────────────

  describe('Error Handling in Payment Flow', () => {
    it('should reject payment exceeding AP open item balance', async () => {
      const apItem = await createApItem(1000);

      await expect(
        paymentMatchingService.makeApPayment(
          {
            vendorId,
            totalAmount: 1500,
            allocations: [{ openItemId: apItem.id, amount: 1500 }],
            paymentMethod: PaymentMethod.TRANSFER,
          },
          userId,
        ),
      ).rejects.toThrow(PaymentExceedsBalanceException);
    });

    it('should reject payment exceeding AR open item balance', async () => {
      const arItem = await createArItem(2000);

      await expect(
        paymentMatchingService.receiveArPayment(
          {
            customerId,
            totalAmount: 3000,
            allocations: [{ openItemId: arItem.id, amount: 3000 }],
            paymentMethod: PaymentMethod.CASH,
          },
          userId,
        ),
      ).rejects.toThrow(PaymentExceedsBalanceException);
    });

    it('should reject payment for non-existent AP open item', async () => {
      await expect(
        paymentMatchingService.makeApPayment(
          {
            vendorId,
            totalAmount: 1000,
            allocations: [{ openItemId: 'non-existent-id', amount: 1000 }],
            paymentMethod: PaymentMethod.TRANSFER,
          },
          userId,
        ),
      ).rejects.toThrow(OpenItemNotFoundException);
    });

    it('should reject payment for non-existent AR open item', async () => {
      await expect(
        paymentMatchingService.receiveArPayment(
          {
            customerId,
            totalAmount: 1000,
            allocations: [{ openItemId: 'non-existent-id', amount: 1000 }],
            paymentMethod: PaymentMethod.CASH,
          },
          userId,
        ),
      ).rejects.toThrow(OpenItemNotFoundException);
    });

    it('should reject CN reduction exceeding AP remaining balance', async () => {
      const apItem = await createApItem(1000);

      await expect(
        apService.reduceApByCn(apItem.id, 1500),
      ).rejects.toThrow(PaymentExceedsBalanceException);
    });

    it('should reject CN reduction exceeding AR remaining balance', async () => {
      const arItem = await createArItem(2000);

      await expect(
        arService.reduceArByCn(arItem.id, 2500),
      ).rejects.toThrow(PaymentExceedsBalanceException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Multi-Item Payment Matching
  // ─────────────────────────────────────────────────────────────────────────

  describe('Multi-Item Payment Matching', () => {
    it('should pay multiple AP items in single payment, closing some and leaving others partial', async () => {
      const ap1 = await createApItem(2000);
      const ap2 = await createApItem(3000);
      const ap3 = await createApItem(5000);

      const result = await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 7000,
          allocations: [
            { openItemId: ap1.id, amount: 2000 }, // Full → CLOSED
            { openItemId: ap2.id, amount: 3000 }, // Full → CLOSED
            { openItemId: ap3.id, amount: 2000 }, // Partial → PARTIAL
          ],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      expect(result.allocations[0].newStatus).toBe(ApArStatus.CLOSED);
      expect(result.allocations[1].newStatus).toBe(ApArStatus.CLOSED);
      expect(result.allocations[2].newStatus).toBe(ApArStatus.PARTIAL);

      // Verify stores
      expect(Number(apStore.get(ap1.id).remainingAmount)).toBe(0);
      expect(Number(apStore.get(ap2.id).remainingAmount)).toBe(0);
      expect(Number(apStore.get(ap3.id).remainingAmount)).toBe(3000);
    });

    it('should pay multiple AR items in single payment', async () => {
      const ar1 = await createArItem(1000);
      const ar2 = await createArItem(2000);

      const result = await paymentMatchingService.receiveArPayment(
        {
          customerId,
          totalAmount: 3000,
          allocations: [
            { openItemId: ar1.id, amount: 1000 },
            { openItemId: ar2.id, amount: 2000 },
          ],
          paymentMethod: PaymentMethod.CASH,
        },
        userId,
      );

      expect(result.allocations[0].newStatus).toBe(ApArStatus.CLOSED);
      expect(result.allocations[1].newStatus).toBe(ApArStatus.CLOSED);
      expect(Number(arStore.get(ar1.id).remainingAmount)).toBe(0);
      expect(Number(arStore.get(ar2.id).remainingAmount)).toBe(0);
    });

    it('should create TX log entry for each payment', async () => {
      const ap1 = await createApItem(5000);

      const result = await paymentMatchingService.makeApPayment(
        {
          vendorId,
          totalAmount: 2000,
          allocations: [{ openItemId: ap1.id, amount: 2000 }],
          paymentMethod: PaymentMethod.TRANSFER,
        },
        userId,
      );

      // Verify TX was created and posted
      expect(result.txEntry.id).toBeDefined();
      expect(result.txEntry.txType).toBe('AP_PAYMENT');
      expect(result.txEntry.status).toBe('POSTED');

      // Verify TX exists in mock TX log
      const tx = await txLogService.findById(result.txEntry.id);
      expect(tx).not.toBeNull();
      expect(tx!.status).toBe('POSTED');
    });
  });
});
