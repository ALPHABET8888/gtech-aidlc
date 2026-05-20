import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { VoidService } from '../../services/void.service';
import { MaCalculationService, MaResult } from '../../services/ma-calculation.service';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import { TxType, TxStatus } from '@prisma/client';
import { Role, AuthContext } from '@autoflow/shared-types';

/**
 * Property-Based Tests for VOID Balance Invariant (P5).
 *
 * **Validates: Requirements US-005**
 *
 * P5: VOID Balance — When a TX is voided, the reverse TX must exactly cancel
 * the original TX's impact. After original TX + reverse TX, the net effect on
 * stock quantity, stock value, MA, AP/AR is zero.
 */

// --- Generators ---

/** Generate a positive quantity for stock movements */
const arbPositiveQty = fc.double({ min: 0.01, max: 100000, noNaN: true });

/** Generate a positive monetary value */
const arbPositiveValue = fc.double({ min: 0.01, max: 10000000, noNaN: true });

/** Generate a positive cost per unit */
const arbPositiveUnitCost = fc.double({ min: 0.01, max: 100000, noNaN: true });

/** TX types that increase stock (goods coming in) */
const STOCK_INCREASING_TX_TYPES: TxType[] = [
  TxType.GR_RECEIVE,
  TxType.GR_REPLACEMENT,
  TxType.CN_SALES_RETURN,
  TxType.ADJ_COUNT_UP,
];

/** TX types that decrease stock (goods going out) */
const STOCK_DECREASING_TX_TYPES: TxType[] = [
  TxType.TEMP_DO,
  TxType.SALE_INVOICE,
  TxType.GR_RETURN,
  TxType.ADJ_COUNT_DOWN,
  TxType.ADJ_WRITEOFF,
  TxType.ADJ_WRITEDOWN,
  TxType.SUPPLY_ISSUE,
];

/** All stock-affecting TX types */
const ALL_STOCK_AFFECTING_TX_TYPES = [
  ...STOCK_INCREASING_TX_TYPES,
  ...STOCK_DECREASING_TX_TYPES,
];

/** Generate a random stock-affecting TX type */
const arbStockAffectingTxType = fc.constantFrom(...ALL_STOCK_AFFECTING_TX_TYPES);

/** Generate a random AP/AR amount (can be null to test non-AP/AR TXs) */
const arbOptionalAmount = fc.option(
  fc.double({ min: 0.01, max: 10000000, noNaN: true }),
  { nil: null },
);

/** A test transaction to be voided */
interface VoidTestTx {
  txType: TxType;
  qty: number;
  unitCost: number;
  totalCost: number;
  arAmount: number | null;
  apAmount: number | null;
}

/** Generate a complete test transaction for voiding */
const arbVoidTestTx: fc.Arbitrary<VoidTestTx> = fc.record({
  txType: arbStockAffectingTxType,
  qty: arbPositiveQty,
  unitCost: arbPositiveUnitCost,
  totalCost: arbPositiveValue,
  arAmount: arbOptionalAmount,
  apAmount: arbOptionalAmount,
});

// --- In-Memory Stock State ---

interface SimulatedStockBalance {
  qty: number;
  totalValue: number;
  ma: number;
}

function createInMemoryStockState(initial: SimulatedStockBalance) {
  let state: SimulatedStockBalance = { ...initial };
  return {
    getState: () => ({ ...state }),
    setState: (newState: SimulatedStockBalance) => {
      state = { ...newState };
    },
  };
}

// --- Test Suite ---

describe('VOID Balance Property-Based Tests (P5)', () => {
  let service: VoidService;
  let txLogRepository: jest.Mocked<TxLogRepository>;
  let maCalculationService: jest.Mocked<MaCalculationService>;
  let prismaService: any;

  const ITEM_ID = 'item-void-pbt-001';
  const WAREHOUSE_ID = 'wh-void-pbt-001';
  const USER_ID = 'user-void-pbt-001';

  const MANAGER_USER: AuthContext = {
    userId: USER_ID,
    username: 'manager-pbt',
    displayName: 'Manager PBT',
    roles: [Role.MANAGER],
    isActive: true,
  };

  beforeEach(async () => {
    const mockPrismaClient = {
      txLog: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    prismaService = {
      $transaction: jest.fn(async (fn: any) => fn(mockPrismaClient)),
      txLog: mockPrismaClient.txLog,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoidService,
        {
          provide: TxLogRepository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: MaCalculationService,
          useValue: {
            calculateNewMa: jest.fn(),
            getCurrentMa: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<VoidService>(VoidService);
    txLogRepository = module.get(TxLogRepository);
    maCalculationService = module.get(MaCalculationService);
  });

  /**
   * Helper: creates a Prisma Decimal-like object for testing.
   */
  function createDecimal(value: number | null) {
    if (value === null) return null;
    const d = Object.create(null);
    d.valueOf = () => value;
    d.toString = () => String(value);
    d[Symbol.toPrimitive] = () => value;
    return d;
  }

  /**
   * Helper: determines if a TX type is stock-increasing.
   */
  function isStockIncreasing(txType: TxType): boolean {
    return STOCK_INCREASING_TX_TYPES.includes(txType);
  }

  /**
   * Helper: creates a mock original TxLog record as returned by the repository.
   */
  function createMockOriginalTx(testTx: VoidTestTx) {
    const signedQty = isStockIncreasing(testTx.txType)
      ? testTx.qty
      : -testTx.qty;

    return {
      id: 'tx-original-001',
      txType: testTx.txType,
      txStatus: TxStatus.POSTED,
      txDate: new Date('2025-01-15'),
      period: '2025-01',
      itemId: ITEM_ID,
      warehouseId: WAREHOUSE_ID,
      qty: createDecimal(signedQty),
      unitCost: createDecimal(testTx.unitCost),
      totalCost: createDecimal(testTx.totalCost),
      maBefore: createDecimal(100),
      maAfter: createDecimal(110),
      stockBefore: createDecimal(50),
      stockAfter: createDecimal(50 + signedQty),
      vendorId: null,
      customerId: null,
      refJoId: null,
      refDoId: null,
      refInvoiceId: null,
      refGrId: null,
      refCnId: null,
      parentTxId: null,
      taxInvoiceNo: null,
      baseAmount: createDecimal(testTx.totalCost),
      vatAmount: createDecimal(testTx.totalCost * 0.07),
      vatType: 'INPUT',
      arAmount: createDecimal(testTx.arAmount),
      apAmount: createDecimal(testTx.apAmount),
      apArStatus: null,
      cogsUnit: null,
      reason: null,
      approvedBy: null,
      approvedAt: null,
      createdBy: USER_ID,
      createdAt: new Date('2025-01-15'),
      updatedAt: new Date('2025-01-15'),
    };
  }

  /**
   * Helper: sets up mocks for a successful void operation and captures the reverse TX data.
   * Returns the captured reverse TX creation data for assertion.
   */
  function setupVoidMocks(testTx: VoidTestTx, stockState: ReturnType<typeof createInMemoryStockState>) {
    const originalTx = createMockOriginalTx(testTx);
    const capturedReverseTx: any[] = [];

    // Mock findById to return original TX
    txLogRepository.findById.mockResolvedValue(originalTx as any);

    // Mock MA calculation for the reverse movement
    const stateBefore = stockState.getState();
    maCalculationService.calculateNewMa.mockImplementation(
      async (itemId, warehouseId, qty, totalCost, isIncrease, tx?) => {
        const currentState = stockState.getState();
        let newQty: number;
        let newTotalValue: number;
        let newMa: number;

        if (isIncrease) {
          newQty = currentState.qty + qty;
          newTotalValue = currentState.totalValue + totalCost;
          newMa = newQty > 0 ? newTotalValue / newQty : 0;
        } else {
          newMa = currentState.ma;
          newQty = currentState.qty - qty;
          newTotalValue = newMa * newQty;
        }

        const result: MaResult = {
          maBefore: currentState.ma,
          maAfter: newMa,
          stockBefore: currentState.qty,
          stockAfter: newQty,
        };

        stockState.setState({ qty: newQty, totalValue: newTotalValue, ma: newMa });
        return result;
      },
    );

    // Mock Prisma $transaction to capture reverse TX creation
    prismaService.$transaction.mockImplementation(async (fn: any) => {
      const mockClient = {
        txLog: {
          create: jest.fn().mockImplementation(({ data }) => {
            capturedReverseTx.push(data);
            return {
              id: 'tx-reverse-001',
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }),
          update: jest.fn().mockResolvedValue({ ...originalTx, txStatus: TxStatus.VOIDED }),
        },
      };
      return fn(mockClient);
    });

    return { originalTx, capturedReverseTx };
  }

  // ===== P5: VOID Balance Invariant =====

  describe('P5: After VOID, net stock effect = 0 (original + reverse cancels out)', () => {
    /**
     * **Validates: Requirements US-005**
     *
     * Property: For any stock-affecting TX, voiding it creates a reverse TX
     * whose qty is exactly the negation of the original qty.
     * Net qty impact = original.qty + reverse.qty = 0.
     */
    it('P5a: reverse TX qty exactly negates original TX qty', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVoidTestTx,
          async (testTx) => {
            // Setup: stock has enough qty to handle any decrease void reversal
            const initialQty = testTx.qty + 100; // Ensure enough stock for reverse
            const stockState = createInMemoryStockState({
              qty: initialQty,
              totalValue: initialQty * 100,
              ma: 100,
            });

            const { originalTx, capturedReverseTx } = setupVoidMocks(testTx, stockState);

            // Execute void
            await service.voidTransaction('tx-original-001', 'PBT test void', MANAGER_USER);

            // Verify: reverse TX was created
            expect(capturedReverseTx.length).toBe(1);
            const reverseTxData = capturedReverseTx[0];

            // P5: qty is negated — net effect = 0
            const originalQty = Number(originalTx.qty);
            const reverseQty = reverseTxData.qty;

            expect(originalQty + reverseQty).toBeCloseTo(0, 4);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-005**
     *
     * Property: For any stock-affecting TX, voiding it creates a reverse TX
     * whose totalCost is exactly the negation of the original totalCost.
     * Net cost impact = original.totalCost + reverse.totalCost = 0.
     */
    it('P5b: reverse TX totalCost exactly negates original TX totalCost', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVoidTestTx,
          async (testTx) => {
            const initialQty = testTx.qty + 100;
            const stockState = createInMemoryStockState({
              qty: initialQty,
              totalValue: initialQty * 100,
              ma: 100,
            });

            const { originalTx, capturedReverseTx } = setupVoidMocks(testTx, stockState);

            await service.voidTransaction('tx-original-001', 'PBT test void', MANAGER_USER);

            expect(capturedReverseTx.length).toBe(1);
            const reverseTxData = capturedReverseTx[0];

            // P5: totalCost is negated — net cost impact = 0
            const originalTotalCost = Number(originalTx.totalCost);
            const reverseTotalCost = reverseTxData.totalCost;

            expect(originalTotalCost + reverseTotalCost).toBeCloseTo(0, 2);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-005**
     *
     * Property: For any TX with AP/AR amounts, voiding it creates a reverse TX
     * whose AP and AR amounts are exactly negated.
     * Net AP impact = original.apAmount + reverse.apAmount = 0.
     * Net AR impact = original.arAmount + reverse.arAmount = 0.
     */
    it('P5c: reverse TX AP/AR amounts exactly negate original AP/AR amounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVoidTestTx,
          async (testTx) => {
            const initialQty = testTx.qty + 100;
            const stockState = createInMemoryStockState({
              qty: initialQty,
              totalValue: initialQty * 100,
              ma: 100,
            });

            const { originalTx, capturedReverseTx } = setupVoidMocks(testTx, stockState);

            await service.voidTransaction('tx-original-001', 'PBT test void', MANAGER_USER);

            expect(capturedReverseTx.length).toBe(1);
            const reverseTxData = capturedReverseTx[0];

            // P5: AP amount is negated — net AP impact = 0
            const originalAp = Number(originalTx.apAmount) || 0;
            const reverseAp = reverseTxData.apAmount || 0;
            expect(originalAp + reverseAp).toBeCloseTo(0, 2);

            // P5: AR amount is negated — net AR impact = 0
            const originalAr = Number(originalTx.arAmount) || 0;
            const reverseAr = reverseTxData.arAmount || 0;
            expect(originalAr + reverseAr).toBeCloseTo(0, 2);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-005**
     *
     * Property: The reverse TX must have parent_tx_id pointing to the original TX.
     * This establishes the VOID reference chain.
     */
    it('P5d: reverse TX has correct parent_tx_id reference to original TX', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVoidTestTx,
          async (testTx) => {
            const initialQty = testTx.qty + 100;
            const stockState = createInMemoryStockState({
              qty: initialQty,
              totalValue: initialQty * 100,
              ma: 100,
            });

            const { capturedReverseTx } = setupVoidMocks(testTx, stockState);

            await service.voidTransaction('tx-original-001', 'PBT test void', MANAGER_USER);

            expect(capturedReverseTx.length).toBe(1);
            const reverseTxData = capturedReverseTx[0];

            // P5: parent_tx_id must point to the original TX
            expect(reverseTxData.parentTx).toEqual({ connect: { id: 'tx-original-001' } });
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-005**
     *
     * Property: After original TX + reverse TX (void), the net effect on
     * stock balance (qty) returns to the pre-original state.
     * stockAfterOriginal + reverseQtyEffect = stockBeforeOriginal.
     */
    it('P5e: stock balance after void returns to pre-original state', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVoidTestTx,
          async (testTx) => {
            // Start with known initial stock
            const initialStockQty = testTx.qty + 200; // Enough for any operation
            const initialMa = 100;
            const initialTotalValue = initialStockQty * initialMa;

            // Simulate the original TX's effect first
            const isIncrease = isStockIncreasing(testTx.txType);
            const originalQtyEffect = isIncrease ? testTx.qty : -testTx.qty;
            const stockAfterOriginal = initialStockQty + originalQtyEffect;

            // Now set up state as if original TX already applied
            const stockState = createInMemoryStockState({
              qty: stockAfterOriginal,
              totalValue: stockAfterOriginal * initialMa,
              ma: initialMa,
            });

            setupVoidMocks(testTx, stockState);

            await service.voidTransaction('tx-original-001', 'PBT test void', MANAGER_USER);

            // After VOID: stock should return to pre-original level
            const finalState = stockState.getState();
            expect(finalState.qty).toBeCloseTo(initialStockQty, 4);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-005**
     *
     * Property: The reverse TX preserves same period, item, and warehouse
     * as the original TX (ensuring it affects the same accounting buckets).
     */
    it('P5f: reverse TX preserves period, item, and warehouse of original', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVoidTestTx,
          async (testTx) => {
            const initialQty = testTx.qty + 100;
            const stockState = createInMemoryStockState({
              qty: initialQty,
              totalValue: initialQty * 100,
              ma: 100,
            });

            const { originalTx, capturedReverseTx } = setupVoidMocks(testTx, stockState);

            await service.voidTransaction('tx-original-001', 'PBT test void', MANAGER_USER);

            expect(capturedReverseTx.length).toBe(1);
            const reverseTxData = capturedReverseTx[0];

            // Same period
            expect(reverseTxData.period).toBe(originalTx.period);

            // Same item (via connect)
            expect(reverseTxData.item).toEqual({ connect: { id: ITEM_ID } });

            // Same warehouse (via connect)
            expect(reverseTxData.warehouse).toEqual({ connect: { id: WAREHOUSE_ID } });
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
