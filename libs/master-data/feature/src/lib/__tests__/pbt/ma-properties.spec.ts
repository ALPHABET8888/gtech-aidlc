import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { MaCalculationService } from '../../services/ma-calculation.service';
import { StockBalanceRepository } from '@autoflow/master-data-data-access';

/**
 * Property-Based Tests for Moving Average (MA) Invariants.
 *
 * **Validates: Requirements US-002**
 *
 * P1: MA Arithmetic Invariant
 *   For any stock-increasing TX: new_ma = (old_total_value + incoming_value) / (old_qty + incoming_qty)
 *   For stock-decreasing TX: MA remains unchanged.
 *
 * P8: MA Consistency Invariant
 *   stock_balance.ma * stock_balance.qty == stock_balance.total_value (within rounding tolerance ±0.01)
 *   Also: MA is always non-negative (MA >= 0)
 */

// --- Shared Generators (reusable across PBT tasks 7.1–7.5) ---

/** Generate a positive quantity (stock movement amount) */
const arbPositiveQty = fc.double({ min: 0.0001, max: 100000, noNaN: true });

/** Generate a positive value (monetary amount for incoming goods) */
const arbPositiveValue = fc.double({ min: 0.01, max: 10000000, noNaN: true });

/** Generate a non-negative initial stock quantity */
const arbInitialQty = fc.double({ min: 0, max: 100000, noNaN: true });

/** Generate a non-negative initial total value */
const arbInitialTotalValue = fc.double({ min: 0, max: 10000000, noNaN: true });

/**
 * A single stock transaction for property testing.
 * isIncrease=true means stock is added (GR_RECEIVE, etc.)
 * isIncrease=false means stock is removed (SALE, etc.)
 */
interface TestTransaction {
  qty: number;
  value: number;
  isIncrease: boolean;
}

/** Generate a stock-increasing transaction */
const arbIncreasingTx: fc.Arbitrary<TestTransaction> = fc.record({
  qty: arbPositiveQty,
  value: arbPositiveValue,
  isIncrease: fc.constant(true),
});

/** Generate a stock transaction (increase or decrease) */
const arbTransaction: fc.Arbitrary<TestTransaction> = fc.oneof(
  arbIncreasingTx,
  fc.record({
    qty: arbPositiveQty,
    value: arbPositiveValue,
    isIncrease: fc.constant(false as boolean),
  }),
);

/** Generate a sequence of transactions */
const arbTransactionSequence = fc.array(arbTransaction, { minLength: 1, maxLength: 20 });

// --- In-Memory Stock Balance Simulation ---

interface SimulatedStockBalance {
  qty: number;
  totalValue: number;
  ma: number;
}

/**
 * Simulates stock balance state in memory.
 * Used to track what the repository "stores" across calls within a test.
 */
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

describe('MA Property-Based Tests (P1, P8)', () => {
  let service: MaCalculationService;
  let stockBalanceRepository: jest.Mocked<StockBalanceRepository>;

  const ITEM_ID = 'item-pbt-001';
  const WAREHOUSE_ID = 'wh-pbt-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaCalculationService,
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

    service = module.get<MaCalculationService>(MaCalculationService);
    stockBalanceRepository = module.get(StockBalanceRepository);
  });

  /**
   * Helper: creates a Prisma Decimal-like object for testing.
   * Prisma Decimal has valueOf/toString that coerce to number.
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
      id: '550e8400-e29b-41d4-a716-446655440010',
      itemId: ITEM_ID,
      warehouseId: WAREHOUSE_ID,
      qty: createDecimal(state.qty),
      totalValue: createDecimal(state.totalValue),
      ma: createDecimal(state.ma),
      isFrozen: false,
      lastTxId: null,
      updatedAt: new Date(),
    };
  }

  /**
   * Sets up the mock repository to simulate an in-memory stock balance
   * that gets updated through the upsert call.
   */
  function setupMockRepository(stockState: ReturnType<typeof createInMemoryStockState>) {
    stockBalanceRepository.findByItemWarehouseForUpdate.mockImplementation(async () => {
      const state = stockState.getState();
      if (state.qty === 0 && state.totalValue === 0 && state.ma === 0) {
        return null; // No stock balance exists yet
      }
      return createMockStockBalance(state) as any;
    });

    stockBalanceRepository.upsert.mockImplementation(async (data: any) => {
      const newState: SimulatedStockBalance = {
        qty: Number(data.qty),
        totalValue: Number(data.totalValue),
        ma: Number(data.ma),
      };
      stockState.setState(newState);
      return createMockStockBalance(newState) as any;
    });
  }

  // ===== P1: MA Arithmetic Invariant =====

  describe('P1: MA = Total Value / Quantity (when qty > 0)', () => {
    /**
     * **Validates: Requirements US-002**
     *
     * Property: For any stock-increasing TX, the resulting MA equals
     * (old_total_value + incoming_value) / (old_qty + incoming_qty)
     */
    it('P1a: after stock increase, MA = (oldTotal + incomingValue) / (oldQty + incomingQty)', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbInitialQty,
          arbInitialTotalValue,
          arbPositiveQty,
          arbPositiveValue,
          async (initialQty, initialTotalValue, incomingQty, incomingValue) => {
            // Setup initial state
            const initialMa = initialQty > 0 ? initialTotalValue / initialQty : 0;
            const stockState = createInMemoryStockState({
              qty: initialQty,
              totalValue: initialTotalValue,
              ma: initialMa,
            });
            setupMockRepository(stockState);

            // Execute stock increase
            const result = await service.calculateNewMa(
              ITEM_ID,
              WAREHOUSE_ID,
              incomingQty,
              incomingValue,
              true, // isIncrease
            );

            // Verify P1: MA = totalValue / qty
            const expectedNewQty = initialQty + incomingQty;
            const expectedNewTotal = initialTotalValue + incomingValue;
            const expectedMa = expectedNewTotal / expectedNewQty;

            const finalState = stockState.getState();

            // MA should equal totalValue / qty (within floating point tolerance)
            expect(result.maAfter).toBeCloseTo(expectedMa, 4);
            expect(finalState.ma).toBeCloseTo(expectedMa, 4);
            expect(finalState.qty).toBeCloseTo(expectedNewQty, 4);
            expect(finalState.totalValue).toBeCloseTo(expectedNewTotal, 4);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-002**
     *
     * Property: For stock-decreasing TX, MA remains unchanged.
     */
    it('P1b: after stock decrease, MA remains unchanged', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Initial qty must be > 0 and initial state must be valid (qty > decrease amount)
          fc.double({ min: 1, max: 100000, noNaN: true }),
          fc.double({ min: 0.01, max: 10000000, noNaN: true }),
          fc.double({ min: 0.0001, max: 1, noNaN: true }), // fraction of stock to decrease
          async (initialQty, initialTotalValue, fractionToDecrease) => {
            const initialMa = initialTotalValue / initialQty;
            const decreaseQty = initialQty * fractionToDecrease; // Always less than available

            const stockState = createInMemoryStockState({
              qty: initialQty,
              totalValue: initialTotalValue,
              ma: initialMa,
            });
            setupMockRepository(stockState);

            // Execute stock decrease
            const result = await service.calculateNewMa(
              ITEM_ID,
              WAREHOUSE_ID,
              decreaseQty,
              decreaseQty * initialMa, // value = qty * MA (typical for decreases)
              false, // isIncrease = false
            );

            // Verify: MA should remain unchanged after decrease
            expect(result.maAfter).toBeCloseTo(initialMa, 4);
            expect(result.maBefore).toBeCloseTo(initialMa, 4);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-002**
     *
     * Property: After any sequence of stock-increasing TXs,
     * MA = totalValue / qty always holds.
     */
    it('P1c: after sequence of increases, MA = totalValue / qty always holds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              qty: arbPositiveQty,
              value: arbPositiveValue,
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (transactions) => {
            const stockState = createInMemoryStockState({
              qty: 0,
              totalValue: 0,
              ma: 0,
            });
            setupMockRepository(stockState);

            // Apply each increasing transaction sequentially
            for (const tx of transactions) {
              await service.calculateNewMa(
                ITEM_ID,
                WAREHOUSE_ID,
                tx.qty,
                tx.value,
                true, // all increases
              );
            }

            // Verify invariant: MA = totalValue / qty
            const finalState = stockState.getState();
            if (finalState.qty > 0) {
              const expectedMa = finalState.totalValue / finalState.qty;
              expect(finalState.ma).toBeCloseTo(expectedMa, 4);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  // ===== P8: MA Non-Negative & Consistency =====

  describe('P8: MA is always non-negative (MA >= 0)', () => {
    /**
     * **Validates: Requirements US-002**
     *
     * Property: After any valid sequence of transactions (increases and decreases
     * that don't cause negative stock), MA >= 0 always.
     */
    it('P8a: MA >= 0 after any valid transaction sequence', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTransactionSequence,
          async (transactions) => {
            const stockState = createInMemoryStockState({
              qty: 0,
              totalValue: 0,
              ma: 0,
            });
            setupMockRepository(stockState);

            for (const tx of transactions) {
              const currentState = stockState.getState();

              if (!tx.isIncrease) {
                // Skip decrease if it would make stock negative
                if (currentState.qty < tx.qty) continue;
              }

              const result = await service.calculateNewMa(
                ITEM_ID,
                WAREHOUSE_ID,
                tx.qty,
                tx.value,
                tx.isIncrease,
              );

              // P8: MA must always be non-negative
              expect(result.maAfter).toBeGreaterThanOrEqual(0);

              const finalState = stockState.getState();
              expect(finalState.ma).toBeGreaterThanOrEqual(0);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-002**
     *
     * Property: ma * qty == totalValue (within ±0.01 tolerance) — the consistency check.
     * This should hold after any valid transaction sequence.
     */
    it('P8b: ma * qty ≈ totalValue (consistency within rounding tolerance)', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTransactionSequence,
          async (transactions) => {
            const stockState = createInMemoryStockState({
              qty: 0,
              totalValue: 0,
              ma: 0,
            });
            setupMockRepository(stockState);

            for (const tx of transactions) {
              const currentState = stockState.getState();

              if (!tx.isIncrease) {
                // Skip decrease if it would make stock negative
                if (currentState.qty < tx.qty) continue;
              }

              await service.calculateNewMa(
                ITEM_ID,
                WAREHOUSE_ID,
                tx.qty,
                tx.value,
                tx.isIncrease,
              );

              // P8 consistency: ma * qty ≈ totalValue
              const finalState = stockState.getState();
              if (finalState.qty > 0) {
                const expectedTotalValue = finalState.ma * finalState.qty;
                expect(finalState.totalValue).toBeCloseTo(expectedTotalValue, 2);
              } else {
                // When qty = 0, totalValue should also be 0
                expect(finalState.totalValue).toBeCloseTo(0, 2);
              }
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-002**
     *
     * Property: Even with extreme values (very large/small quantities and values),
     * MA remains non-negative.
     */
    it('P8c: MA non-negative with extreme values', async () => {
      const arbExtremeQty = fc.double({ min: 0.0001, max: 999999, noNaN: true });
      const arbExtremeValue = fc.double({ min: 0.01, max: 9999999, noNaN: true });

      await fc.assert(
        fc.asyncProperty(
          arbExtremeQty,
          arbExtremeValue,
          async (qty, value) => {
            const stockState = createInMemoryStockState({
              qty: 0,
              totalValue: 0,
              ma: 0,
            });
            setupMockRepository(stockState);

            const result = await service.calculateNewMa(
              ITEM_ID,
              WAREHOUSE_ID,
              qty,
              value,
              true, // increase
            );

            // MA must be non-negative
            expect(result.maAfter).toBeGreaterThanOrEqual(0);
            // And equals value / qty for first receipt
            expect(result.maAfter).toBeCloseTo(value / qty, 4);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
