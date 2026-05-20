import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { StockValidationService } from '../../services/stock-validation.service';
import { StockBalanceRepository } from '@autoflow/master-data-data-access';
import { StockNegativeException } from '@autoflow/shared-errors';

/**
 * Property-Based Tests for Stock Non-Negative Invariant (P2).
 *
 * **Validates: Requirements US-003**
 *
 * P2: Stock quantity can never go negative.
 *   - The system must reject/throw an error for any transaction that would cause stock to go below zero.
 *   - For any valid sequence of transactions, qty >= 0 always holds.
 *   - The system blocks the transaction BEFORE stock goes negative.
 */

// --- Generators ---

/** Generate a positive quantity for stock movements */
const arbPositiveQty = fc.double({ min: 0.0001, max: 100000, noNaN: true });

/** Generate a non-negative initial stock quantity */
const arbInitialQty = fc.double({ min: 0, max: 100000, noNaN: true });

/**
 * A stock transaction for testing the non-negative invariant.
 * isIncrease=true means stock is added (GR_RECEIVE, etc.)
 * isIncrease=false means stock is removed (SALE, etc.)
 */
interface StockTransaction {
  qty: number;
  isIncrease: boolean;
}

/** Generate a stock-increasing transaction */
const arbIncreasingTx: fc.Arbitrary<StockTransaction> = fc.record({
  qty: arbPositiveQty,
  isIncrease: fc.constant(true),
});

/** Generate a stock-decreasing transaction */
const arbDecreasingTx: fc.Arbitrary<StockTransaction> = fc.record({
  qty: arbPositiveQty,
  isIncrease: fc.constant(false as boolean),
});

/** Generate a mixed transaction (increase or decrease) */
const arbMixedTx: fc.Arbitrary<StockTransaction> = fc.oneof(
  arbIncreasingTx,
  arbDecreasingTx,
);

/** Generate a sequence of mixed transactions */
const arbTransactionSequence = fc.array(arbMixedTx, { minLength: 1, maxLength: 20 });

// --- In-Memory Stock State ---

interface SimulatedStockBalance {
  qty: number;
  isFrozen: boolean;
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

describe('Stock Non-Negative Property-Based Tests (P2)', () => {
  let service: StockValidationService;
  let stockBalanceRepository: jest.Mocked<StockBalanceRepository>;

  const ITEM_ID = 'item-stock-pbt-001';
  const WAREHOUSE_ID = 'wh-stock-pbt-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockValidationService,
        {
          provide: StockBalanceRepository,
          useValue: {
            findByItemWarehouse: jest.fn(),
            findByItemWarehouseForUpdate: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockValidationService>(StockValidationService);
    stockBalanceRepository = module.get(StockBalanceRepository);
  });

  /**
   * Helper: creates a Prisma Decimal-like object for testing.
   */
  function createDecimal(value: number) {
    const d = Object.create(null);
    d.valueOf = () => value;
    d.toString = () => String(value);
    d[Symbol.toPrimitive] = () => value;
    return d;
  }

  /**
   * Helper: creates a mock StockBalance DB row.
   */
  function createMockStockBalance(state: SimulatedStockBalance) {
    return {
      id: '550e8400-e29b-41d4-a716-446655440020',
      itemId: ITEM_ID,
      warehouseId: WAREHOUSE_ID,
      qty: createDecimal(state.qty),
      totalValue: createDecimal(state.qty * 100), // arbitrary total value
      ma: createDecimal(100), // arbitrary MA
      isFrozen: state.isFrozen,
      lastTxId: null,
      updatedAt: new Date(),
    };
  }

  /**
   * Sets up the mock repository to reflect the current in-memory state.
   */
  function setupMockRepository(stockState: ReturnType<typeof createInMemoryStockState>) {
    stockBalanceRepository.findByItemWarehouse.mockImplementation(async () => {
      const state = stockState.getState();
      if (state.qty === 0) {
        return null; // No stock balance exists yet
      }
      return createMockStockBalance(state) as any;
    });
  }

  // ===== P2: Stock Non-Negative Invariant =====

  describe('P2: Stock quantity can never go negative', () => {
    /**
     * **Validates: Requirements US-003**
     *
     * Property: For any deduction amount greater than available stock,
     * the service MUST throw StockNegativeException.
     */
    it('P2a: any deduction exceeding available stock throws StockNegativeException', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbInitialQty,
          arbPositiveQty,
          async (currentStock, extraAmount) => {
            // Generate a deduction that exceeds available stock
            const deductionQty = currentStock + extraAmount; // Always exceeds by extraAmount

            const stockState = createInMemoryStockState({
              qty: currentStock,
              isFrozen: false,
            });
            setupMockRepository(stockState);

            // The service MUST reject this deduction
            await expect(
              service.validateStockAvailable(ITEM_ID, WAREHOUSE_ID, deductionQty),
            ).rejects.toThrow(StockNegativeException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-003**
     *
     * Property: For any deduction amount less than or equal to available stock,
     * the validation passes (no exception thrown).
     */
    it('P2b: any deduction within available stock passes validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0.0001, max: 100000, noNaN: true }), // currentStock > 0
          fc.double({ min: 0, max: 1, noNaN: true }), // fraction (0 to 1)
          async (currentStock, fraction) => {
            // Deduction is a fraction of available stock (always valid)
            const deductionQty = currentStock * fraction;

            // Skip trivial case (deduction = 0)
            if (deductionQty === 0) return;

            const stockState = createInMemoryStockState({
              qty: currentStock,
              isFrozen: false,
            });
            setupMockRepository(stockState);

            // The service MUST allow this deduction (no exception)
            await expect(
              service.validateStockAvailable(ITEM_ID, WAREHOUSE_ID, deductionQty),
            ).resolves.toBeUndefined();
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-003**
     *
     * Property: For any valid sequence of transactions where decreases
     * are only applied when stock is sufficient, stock never goes negative.
     * When a decrease WOULD cause negative stock, the system rejects it.
     */
    it('P2c: after any valid transaction sequence, stock >= 0 always holds', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTransactionSequence,
          async (transactions) => {
            let currentQty = 0;

            for (const tx of transactions) {
              const stockState = createInMemoryStockState({
                qty: currentQty,
                isFrozen: false,
              });
              setupMockRepository(stockState);

              if (tx.isIncrease) {
                // Stock increase: qty goes up, always valid
                currentQty += tx.qty;
              } else {
                // Stock decrease: validate first
                if (currentQty - tx.qty < 0) {
                  // System MUST reject this — would go negative
                  await expect(
                    service.validateStockAvailable(ITEM_ID, WAREHOUSE_ID, tx.qty),
                  ).rejects.toThrow(StockNegativeException);
                  // Stock remains unchanged (transaction blocked)
                } else {
                  // Valid deduction — system allows it
                  await expect(
                    service.validateStockAvailable(ITEM_ID, WAREHOUSE_ID, tx.qty),
                  ).resolves.toBeUndefined();
                  currentQty -= tx.qty;
                }
              }

              // INVARIANT: stock quantity is ALWAYS >= 0
              expect(currentQty).toBeGreaterThanOrEqual(0);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-003**
     *
     * Property: Deducting from zero stock (no balance record) always throws.
     * This covers the edge case where no stock_balance row exists.
     */
    it('P2d: deduction from zero stock (no record) always throws StockNegativeException', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPositiveQty,
          async (deductionQty) => {
            // No stock balance record exists (null from repository)
            stockBalanceRepository.findByItemWarehouse.mockResolvedValue(null);

            // Any positive deduction from zero stock MUST throw
            await expect(
              service.validateStockAvailable(ITEM_ID, WAREHOUSE_ID, deductionQty),
            ).rejects.toThrow(StockNegativeException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-003**
     *
     * Property: Deducting exactly the available stock (stock goes to zero) is valid.
     * Zero is not negative — the system must allow this boundary case.
     */
    it('P2e: deducting exactly available stock (qty -> 0) passes validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0.0001, max: 100000, noNaN: true }), // any positive stock
          async (currentStock) => {
            const stockState = createInMemoryStockState({
              qty: currentStock,
              isFrozen: false,
            });
            setupMockRepository(stockState);

            // Deducting exactly the available amount: stock becomes 0 (not negative)
            await expect(
              service.validateStockAvailable(ITEM_ID, WAREHOUSE_ID, currentStock),
            ).resolves.toBeUndefined();
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
