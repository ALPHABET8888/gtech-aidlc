/**
 * Property-Based Test: Payment Allocation Sum Invariant (Property 3)
 *
 * **Validates: Requirements US-014, US-021**
 *
 * Property 3: Sum of allocations in a payment must equal totalAmount (no money leak).
 * The system either accepts (when sum = total) or rejects (when sum ≠ total).
 */
import * as fc from 'fast-check';

// ─── Pure Logic Extraction ───────────────────────────────────────────────────
// Extracted from PaymentMatchingService.validateAllocationSum()

/**
 * Validates that the sum of all allocation amounts equals the totalAmount.
 * Uses rounding to avoid floating point issues (2 decimal places for THB).
 * Mirrors PaymentMatchingService.validateAllocationSum().
 */
function validateAllocationSum(
  allocations: { amount: number }[],
  totalAmount: number,
): { valid: boolean; sum: number; total: number } {
  const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
  const roundedSum = Math.round(sum * 100) / 100;
  const roundedTotal = Math.round(totalAmount * 100) / 100;

  return {
    valid: roundedSum === roundedTotal,
    sum: roundedSum,
    total: roundedTotal,
  };
}

/**
 * Distributes a total amount across N allocations such that sum = total.
 * This simulates a valid payment allocation split.
 */
function distributeAmount(
  totalAmount: number,
  numItems: number,
): { openItemId: string; amount: number }[] {
  if (numItems <= 0) return [];

  const allocations: { openItemId: string; amount: number }[] = [];
  let remaining = Math.round(totalAmount * 100) / 100;

  for (let i = 0; i < numItems - 1; i++) {
    // Allocate a random portion (but ensure we leave something for the rest)
    const maxForThis = remaining / (numItems - i);
    const amount = Math.round(maxForThis * 100) / 100;
    allocations.push({
      openItemId: `open-item-${i}`,
      amount,
    });
    remaining = Math.round((remaining - amount) * 100) / 100;
  }

  // Last item gets the remainder (ensures exact sum)
  allocations.push({
    openItemId: `open-item-${numItems - 1}`,
    amount: remaining,
  });

  return allocations;
}

// ─── Property-Based Tests ────────────────────────────────────────────────────

describe('Property 3: Payment Allocation Sum Invariant (No Money Leak)', () => {
  /**
   * When allocations are correctly distributed, the sum must equal totalAmount.
   * This verifies the "happy path" — valid allocations are accepted.
   */
  it('correctly distributed allocations always pass validation', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (totalAmount, numItems) => {
          const roundedTotal = Math.round(totalAmount * 100) / 100;
          if (roundedTotal <= 0) return true; // skip invalid amounts
          const allocations = distributeAmount(roundedTotal, numItems);
          const result = validateAllocationSum(allocations, roundedTotal);
          return result.valid;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * When allocation sum does NOT equal totalAmount, validation must reject.
   * This verifies the "error path" — invalid allocations are caught.
   */
  it('mismatched allocation sum always fails validation', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(1000000), noNaN: true }),
        fc.float({ min: Math.fround(1), max: Math.fround(1000000), noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (totalAmount, differentTotal, numItems) => {
          const roundedTotal = Math.round(totalAmount * 100) / 100;
          const roundedDifferent = Math.round(differentTotal * 100) / 100;

          // Skip if they happen to be equal
          if (roundedTotal === roundedDifferent) return true;

          // Distribute based on one amount, validate against a different amount
          const allocations = distributeAmount(roundedTotal, numItems);
          const result = validateAllocationSum(allocations, roundedDifferent);
          return !result.valid;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * The sum of allocations is always preserved after distribution.
   * No money is created or destroyed during the split.
   */
  it('distribution preserves total amount (no money leak)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (totalAmount, numItems) => {
          const roundedTotal = Math.round(totalAmount * 100) / 100;
          if (roundedTotal <= 0) return true; // skip invalid amounts
          const allocations = distributeAmount(roundedTotal, numItems);
          const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
          const roundedSum = Math.round(sum * 100) / 100;
          return roundedSum === roundedTotal;
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * Single allocation must equal the total amount exactly.
   */
  it('single allocation equals total amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
        (totalAmount) => {
          const roundedTotal = Math.round(totalAmount * 100) / 100;
          if (roundedTotal <= 0) return true; // skip invalid amounts
          const allocations = distributeAmount(roundedTotal, 1);
          return allocations.length === 1 && allocations[0].amount === roundedTotal;
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Adding even 0.01 THB (1 satang) to any allocation breaks the invariant.
   */
  it('adding 1 satang to any allocation breaks the invariant', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(100000), noNaN: true }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 4 }),
        (totalAmount, numItems, tamperIndex) => {
          const roundedTotal = Math.round(totalAmount * 100) / 100;
          if (roundedTotal <= 0) return true; // skip invalid amounts
          const allocations = distributeAmount(roundedTotal, numItems);

          // Tamper with one allocation (add 1 satang)
          const idx = tamperIndex % allocations.length;
          allocations[idx].amount = Math.round((allocations[idx].amount + 0.01) * 100) / 100;

          const result = validateAllocationSum(allocations, roundedTotal);
          return !result.valid;
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Zero total amount with empty allocations is valid.
   */
  it('zero total with empty allocations is valid', () => {
    const result = validateAllocationSum([], 0);
    expect(result.valid).toBe(true);
  });
});
