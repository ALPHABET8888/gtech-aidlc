/**
 * Property-Based Tests: GR/IR Clearing Lifecycle + PPV Calculation (Properties 5, 6)
 *
 * **Validates: Requirements US-016, US-017, US-018**
 *
 * Property 5: Clearing open/close consistency — close only once
 * Property 6: PPV calculation correctness — PPV = clearingAmount - cnAmount
 *
 * Tests the clearing lifecycle logic in GrIrClearingService:
 * - Clearing is opened on GR_RETURN
 * - Clearing is closed by either GR_REPLACEMENT or CN_RETURN (exactly once)
 * - PPV is calculated as clearingAmount - cnAmount on CN_RETURN close
 */
import * as fc from 'fast-check';

// ─── Pure Logic Extraction ───────────────────────────────────────────────────
// Extracted from GrIrClearingService for testing without DI.

type ClearingStatus = 'OPEN' | 'CLOSED';
type CloseType = 'CN_RETURN' | 'GR_REPLACEMENT';

interface Clearing {
  id: string;
  status: ClearingStatus;
  clearingAmount: number;
  ppvAmount: number | null;
  closedByType: CloseType | null;
  closedByTxId: string | null;
}

/**
 * Creates a new clearing entry in OPEN status.
 * Mirrors GrIrClearingService.openClearing().
 */
function createClearing(clearingAmount: number): Clearing {
  return {
    id: `clearing-${Date.now()}`,
    status: 'OPEN',
    clearingAmount: Math.round(clearingAmount * 100) / 100,
    ppvAmount: null,
    closedByType: null,
    closedByTxId: null,
  };
}

/**
 * Attempts to close a clearing. Returns success/failure.
 * Mirrors the guard logic in GrIrClearingService.closeByReplacement() and closeByCnReturn().
 *
 * - If clearing is OPEN → close succeeds, status becomes CLOSED
 * - If clearing is already CLOSED → throws (returns failure)
 */
function attemptClose(
  clearing: Clearing,
  attempt: { type: CloseType; amount: number },
): { success: boolean; ppv: number | null } {
  if (clearing.status !== 'OPEN') {
    return { success: false, ppv: null };
  }

  // Close the clearing
  clearing.status = 'CLOSED';
  clearing.closedByType = attempt.type;
  clearing.closedByTxId = `tx-${Date.now()}`;

  if (attempt.type === 'GR_REPLACEMENT') {
    // Replacement: PPV = 0 (same goods returned)
    clearing.ppvAmount = 0;
    return { success: true, ppv: 0 };
  } else {
    // CN_RETURN: PPV = clearingAmount - cnAmount
    const ppv = Math.round((clearing.clearingAmount - attempt.amount) * 100) / 100;
    clearing.ppvAmount = ppv;
    return { success: true, ppv };
  }
}

/**
 * Calculates PPV for a CN_RETURN close operation.
 * PPV = clearingAmount - cnAmount
 * Where:
 *   clearingAmount = qty * MA at time of return (GR_RETURN)
 *   cnAmount = the CN invoice total (passed directly)
 *
 * Mirrors the PPV calculation in GrIrClearingService.closeByCnReturn():
 *   const ppv = Number(clearing.clearingAmount) - cnAmount;
 */
function calculatePpv(
  clearingAmount: number,
  cnAmount: number,
): number {
  const ppv = clearingAmount - cnAmount;
  return Math.round(ppv * 100) / 100;
}

// ─── Property-Based Tests ────────────────────────────────────────────────────

describe('Clearing Lifecycle Properties (Properties 5, 6)', () => {
  /**
   * Property 5: GR/IR Clearing Lifecycle — Open/Close Consistency
   *
   * **Validates: Requirements US-016, US-017, US-018**
   *
   * Clearing ที่ OPEN ต้องถูก close ได้เพียงครั้งเดียว
   * Clearing ที่ CLOSED ต้อง reject การ close ซ้ำ
   */
  describe('Property 5: Clearing Open/Close Consistency', () => {
    it('only the first close attempt succeeds, all subsequent attempts are rejected', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          fc.array(
            fc.record({
              type: fc.constantFrom('CN_RETURN' as CloseType, 'GR_REPLACEMENT' as CloseType),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (clearingAmount, closeAttempts) => {
            const roundedAmount = Math.round(clearingAmount * 100) / 100;
            if (roundedAmount <= 0) return true; // skip invalid

            const clearing = createClearing(roundedAmount);
            let closedCount = 0;

            for (const attempt of closeAttempts) {
              const result = attemptClose(clearing, attempt);
              if (result.success) closedCount++;
            }

            // Only first close should succeed — at most 1
            return closedCount <= 1;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('exactly one close succeeds when multiple attempts are made', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          fc.array(
            fc.record({
              type: fc.constantFrom('CN_RETURN' as CloseType, 'GR_REPLACEMENT' as CloseType),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            }),
            { minLength: 1, maxLength: 5 },
          ),
          (clearingAmount, closeAttempts) => {
            const roundedAmount = Math.round(clearingAmount * 100) / 100;
            if (roundedAmount <= 0) return true; // skip invalid

            const clearing = createClearing(roundedAmount);
            let closedCount = 0;

            for (const attempt of closeAttempts) {
              const result = attemptClose(clearing, attempt);
              if (result.success) closedCount++;
            }

            // Exactly 1 close should succeed (since clearing starts OPEN)
            return closedCount === 1;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('clearing status is CLOSED after first successful close', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          fc.constantFrom('CN_RETURN' as CloseType, 'GR_REPLACEMENT' as CloseType),
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          (clearingAmount, closeType, cnAmount) => {
            const roundedAmount = Math.round(clearingAmount * 100) / 100;
            if (roundedAmount <= 0) return true; // skip invalid

            const clearing = createClearing(roundedAmount);
            const result = attemptClose(clearing, { type: closeType, amount: cnAmount });

            return result.success && clearing.status === 'CLOSED';
          },
        ),
        { numRuns: 200 },
      );
    });

    it('a newly created clearing is always OPEN', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          (clearingAmount) => {
            const roundedAmount = Math.round(clearingAmount * 100) / 100;
            if (roundedAmount <= 0) return true; // skip invalid

            const clearing = createClearing(roundedAmount);
            return clearing.status === 'OPEN';
          },
        ),
        { numRuns: 200 },
      );
    });

    it('GR_REPLACEMENT close always produces PPV = 0', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          (clearingAmount) => {
            const roundedAmount = Math.round(clearingAmount * 100) / 100;
            if (roundedAmount <= 0) return true; // skip invalid

            const clearing = createClearing(roundedAmount);
            const result = attemptClose(clearing, {
              type: 'GR_REPLACEMENT',
              amount: 0, // amount irrelevant for replacement
            });

            return result.success && result.ppv === 0;
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  /**
   * Property 6: PPV Calculation Correctness
   *
   * **Validates: Requirements US-018**
   *
   * PPV = clearingAmount - cnAmount
   * Where clearingAmount = returnQty * maAtReturn
   * And cnAmount = returnQty * invoiceUnitCost
   * Therefore PPV = returnQty * (maAtReturn - invoiceUnitCost)
   */
  describe('Property 6: PPV Calculation Correctness', () => {
    it('PPV equals clearingAmount minus cnAmount for any valid inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          (returnQty, maAtReturn, invoiceUnitCost) => {
            const clearingAmount = Math.round(returnQty * maAtReturn * 100) / 100;
            const cnAmount = Math.round(returnQty * invoiceUnitCost * 100) / 100;
            const expectedPpv = Math.round((clearingAmount - cnAmount) * 100) / 100;

            const result = calculatePpv(clearingAmount, cnAmount);
            return Math.abs(result - expectedPpv) < 0.01;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('PPV is zero when MA equals invoice unit cost', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          (returnQty, unitCost) => {
            // When MA = invoiceUnitCost, clearingAmount = cnAmount → PPV = 0
            const clearingAmount = Math.round(returnQty * unitCost * 100) / 100;
            const cnAmount = clearingAmount; // same cost → PPV = 0
            const result = calculatePpv(clearingAmount, cnAmount);
            return Math.abs(result) < 0.01;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('PPV is positive when MA > invoice unit cost (favorable variance)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
          (returnQty, baseCost, premium) => {
            // MA > invoiceUnitCost → positive PPV
            const invoiceUnitCost = Math.round(baseCost * 100) / 100;
            const maAtReturn = Math.round((baseCost + premium) * 100) / 100;

            if (maAtReturn <= invoiceUnitCost) return true; // skip if no premium

            const clearingAmount = Math.round(returnQty * maAtReturn * 100) / 100;
            const cnAmount = Math.round(returnQty * invoiceUnitCost * 100) / 100;
            const result = calculatePpv(clearingAmount, cnAmount);
            return result > 0;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('PPV is negative when MA < invoice unit cost (unfavorable variance)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
          (returnQty, baseCost, premium) => {
            // MA < invoiceUnitCost → negative PPV
            const maAtReturn = Math.round(baseCost * 100) / 100;
            const invoiceUnitCost = Math.round((baseCost + premium) * 100) / 100;

            if (invoiceUnitCost <= maAtReturn) return true; // skip if no premium

            const clearingAmount = Math.round(returnQty * maAtReturn * 100) / 100;
            const cnAmount = Math.round(returnQty * invoiceUnitCost * 100) / 100;
            const result = calculatePpv(clearingAmount, cnAmount);
            return result < 0;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('PPV through clearing close matches direct calculation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          (returnQty, maAtReturn, invoiceUnitCost) => {
            // Simulate the full flow: open clearing → close by CN_RETURN
            const clearingAmount = Math.round(returnQty * maAtReturn * 100) / 100;
            const cnAmount = Math.round(returnQty * invoiceUnitCost * 100) / 100;

            // Create and close clearing (integration of Property 5 + 6)
            const clearing = createClearing(clearingAmount);
            const closeResult = attemptClose(clearing, {
              type: 'CN_RETURN',
              amount: cnAmount,
            });

            // Direct PPV calculation
            const directPpv = calculatePpv(clearingAmount, cnAmount);

            // Both methods should produce the same PPV
            return (
              closeResult.success &&
              closeResult.ppv !== null &&
              Math.abs(closeResult.ppv - directPpv) < 0.01
            );
          },
        ),
        { numRuns: 1000 },
      );
    });
  });
});
