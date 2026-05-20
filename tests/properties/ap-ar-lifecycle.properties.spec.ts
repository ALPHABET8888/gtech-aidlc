/**
 * Property-Based Tests: AP/AR Open Item Lifecycle (Properties 1, 2)
 *
 * **Validates: Requirements US-026, US-027**
 *
 * Property 1: Balance invariant — remainingAmount = originalAmount - sum(payments) - sum(cnReductions)
 * Property 2: Status consistency — CLOSED when 0, PARTIAL when between, OPEN when full
 *
 * Tests the core AP/AR lifecycle logic extracted from ApService/ArService:
 * - Open items start with remainingAmount = originalAmount, status = OPEN
 * - Payments and CN reductions decrease remainingAmount
 * - Status automatically transitions based on remainingAmount vs originalAmount
 */
import * as fc from 'fast-check';

// ─── Pure Logic Extraction ───────────────────────────────────────────────────
// Extracted from ApService.calculateStatus() and ArService.calculateStatus()
// Both services share identical logic for status calculation and balance management.

type ApArStatus = 'OPEN' | 'PARTIAL' | 'CLOSED';

interface OpenItem {
  originalAmount: number;
  remainingAmount: number;
  status: ApArStatus;
}

/**
 * Calculate status based on remaining vs original amount.
 * Mirrors ApService.calculateStatus() and ArService.calculateStatus().
 */
function calculateStatus(
  remainingAmount: number,
  originalAmount: number,
): ApArStatus {
  if (remainingAmount <= 0) {
    return 'CLOSED';
  }
  if (remainingAmount < originalAmount) {
    return 'PARTIAL';
  }
  return 'OPEN';
}

/**
 * Create a new open item with initial state.
 * Mirrors ApService.createApOpenItem() / ArService.createArOpenItem().
 */
function createOpenItem(originalAmount: number): OpenItem {
  return {
    originalAmount: Math.round(originalAmount * 100) / 100,
    remainingAmount: Math.round(originalAmount * 100) / 100,
    status: 'OPEN',
  };
}

/**
 * Apply a payment to an open item (reduces remaining balance).
 * Mirrors PaymentMatchingService logic for updating open items.
 * Returns false if payment exceeds remaining balance (rejected).
 */
function applyPayment(item: OpenItem, amount: number): boolean {
  const roundedAmount = Math.round(amount * 100) / 100;
  if (roundedAmount > item.remainingAmount) {
    return false; // Payment exceeds balance — rejected
  }
  item.remainingAmount = Math.round((item.remainingAmount - roundedAmount) * 100) / 100;
  item.status = calculateStatus(item.remainingAmount, item.originalAmount);
  return true;
}

/**
 * Apply a CN reduction to an open item (reduces remaining balance).
 * Mirrors ApService.reduceApByCn() / ArService.reduceArByCn().
 * Returns false if reduction exceeds remaining balance (rejected).
 */
function applyCnReduction(item: OpenItem, amount: number): boolean {
  const roundedAmount = Math.round(amount * 100) / 100;
  if (roundedAmount > item.remainingAmount) {
    return false; // CN exceeds balance — rejected
  }
  item.remainingAmount = Math.round((item.remainingAmount - roundedAmount) * 100) / 100;
  item.status = calculateStatus(item.remainingAmount, item.originalAmount);
  return true;
}

/**
 * Filter allocations to only include valid ones (cumulative sum ≤ limit).
 * Used to generate valid test scenarios from random inputs.
 */
function filterToValidAllocations(
  amounts: number[],
  limit: number,
): number[] {
  const valid: number[] = [];
  let cumulative = 0;

  for (const amount of amounts) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded <= 0) continue;
    if (cumulative + rounded > limit) continue;
    valid.push(rounded);
    cumulative = Math.round((cumulative + rounded) * 100) / 100;
  }

  return valid;
}

// ─── Property-Based Tests ────────────────────────────────────────────────────

describe('AP/AR Open Item Lifecycle Properties (Properties 1, 2)', () => {
  /**
   * Property 1: AP/AR Open Item Balance Invariant
   *
   * **Validates: Requirements US-026, US-027**
   *
   * For any open item, remainingAmount must always equal:
   *   originalAmount - sum(payments) - sum(cnReductions)
   *
   * This invariant must hold regardless of the order or number of operations.
   */
  describe('Property 1: Balance Invariant', () => {
    it('remaining = original - payments - cnReductions (always holds)', () => {
      fc.assert(
        fc.property(
          fc.record({
            originalAmount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            payments: fc.array(
              fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
              { maxLength: 10 },
            ),
            cnReductions: fc.array(
              fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
              { maxLength: 5 },
            ),
          }),
          ({ originalAmount, payments, cnReductions }) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true; // skip invalid amounts

            // Filter to valid allocations (cumulative sum ≤ original)
            const validPayments = filterToValidAllocations(payments, roundedOriginal);
            const paymentSum = validPayments.reduce((s, p) => Math.round((s + p) * 100) / 100, 0);
            const validCns = filterToValidAllocations(cnReductions, roundedOriginal - paymentSum);
            const cnSum = validCns.reduce((s, c) => Math.round((s + c) * 100) / 100, 0);

            // Apply operations
            const item = createOpenItem(roundedOriginal);
            validPayments.forEach((p) => applyPayment(item, p));
            validCns.forEach((cn) => applyCnReduction(item, cn));

            // Verify invariant
            const expectedRemaining = Math.round((roundedOriginal - paymentSum - cnSum) * 100) / 100;
            return item.remainingAmount === expectedRemaining;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('payments applied in any order produce the same remaining balance', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(100), max: Math.fround(1000000), noNaN: true }),
          fc.array(
            fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
            { minLength: 2, maxLength: 8 },
          ),
          (originalAmount, payments) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true;

            const validPayments = filterToValidAllocations(payments, roundedOriginal);
            if (validPayments.length < 2) return true; // need at least 2 to test order

            // Apply in original order
            const item1 = createOpenItem(roundedOriginal);
            validPayments.forEach((p) => applyPayment(item1, p));

            // Apply in reverse order
            const item2 = createOpenItem(roundedOriginal);
            [...validPayments].reverse().forEach((p) => applyPayment(item2, p));

            return item1.remainingAmount === item2.remainingAmount;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('rejected payments do not change remaining balance', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }),
          fc.float({ min: Math.fround(1001), max: Math.fround(1000000), noNaN: true }),
          (originalAmount, excessivePayment) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true;

            const item = createOpenItem(roundedOriginal);
            const balanceBefore = item.remainingAmount;

            // Attempt payment that exceeds balance
            const accepted = applyPayment(item, excessivePayment);

            // Payment should be rejected and balance unchanged
            return !accepted && item.remainingAmount === balanceBefore;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('paying exact remaining amount results in zero balance', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          fc.array(
            fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
            { maxLength: 5 },
          ),
          (originalAmount, partialPayments) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true;

            const item = createOpenItem(roundedOriginal);

            // Apply some partial payments
            const validPartials = filterToValidAllocations(partialPayments, roundedOriginal - 0.01);
            validPartials.forEach((p) => applyPayment(item, p));

            // Pay the exact remaining
            const remaining = item.remainingAmount;
            if (remaining > 0) {
              applyPayment(item, remaining);
              return item.remainingAmount === 0;
            }
            return true;
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  /**
   * Property 2: AP/AR Status Consistency
   *
   * **Validates: Requirements US-026, US-027**
   *
   * Status must always be consistent with remainingAmount:
   * - remainingAmount = 0 → status = CLOSED
   * - 0 < remainingAmount < originalAmount → status = PARTIAL
   * - remainingAmount = originalAmount → status = OPEN
   */
  describe('Property 2: Status Consistency', () => {
    it('status is always consistent with remaining amount after operations', () => {
      fc.assert(
        fc.property(
          fc.record({
            originalAmount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            payments: fc.array(
              fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
              { maxLength: 10 },
            ),
            cnReductions: fc.array(
              fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
              { maxLength: 5 },
            ),
          }),
          ({ originalAmount, payments, cnReductions }) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true;

            // Filter to valid allocations
            const validPayments = filterToValidAllocations(payments, roundedOriginal);
            const paymentSum = validPayments.reduce((s, p) => Math.round((s + p) * 100) / 100, 0);
            const validCns = filterToValidAllocations(cnReductions, roundedOriginal - paymentSum);

            // Apply operations
            const item = createOpenItem(roundedOriginal);
            validPayments.forEach((p) => applyPayment(item, p));
            validCns.forEach((cn) => applyCnReduction(item, cn));

            // Verify status consistency
            if (item.remainingAmount === 0) return item.status === 'CLOSED';
            if (item.remainingAmount === item.originalAmount) return item.status === 'OPEN';
            return item.status === 'PARTIAL';
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('new open item always starts with status OPEN', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          (originalAmount) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true;

            const item = createOpenItem(roundedOriginal);
            return item.status === 'OPEN' && item.remainingAmount === item.originalAmount;
          },
        ),
        { numRuns: 200 },
      );
    });

    it('full payment always results in CLOSED status', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
          (originalAmount) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true;

            const item = createOpenItem(roundedOriginal);
            applyPayment(item, roundedOriginal);

            return item.status === 'CLOSED' && item.remainingAmount === 0;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('partial payment always results in PARTIAL status', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(1), max: Math.fround(1000000), noNaN: true }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true }),
          (originalAmount, fraction) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 1) return true; // need room for partial

            // Pay a fraction of the original
            const paymentAmount = Math.round(roundedOriginal * fraction * 100) / 100;
            if (paymentAmount <= 0 || paymentAmount >= roundedOriginal) return true;

            const item = createOpenItem(roundedOriginal);
            applyPayment(item, paymentAmount);

            return item.status === 'PARTIAL';
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('status transitions follow OPEN → PARTIAL → CLOSED sequence', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(100), max: Math.fround(1000000), noNaN: true }),
          fc.array(
            fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
            { minLength: 1, maxLength: 10 },
          ),
          (originalAmount, payments) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            if (roundedOriginal <= 0) return true;

            const validPayments = filterToValidAllocations(payments, roundedOriginal);
            if (validPayments.length === 0) return true;

            const item = createOpenItem(roundedOriginal);
            const statusHistory: ApArStatus[] = [item.status];

            // Apply payments and track status transitions
            for (const payment of validPayments) {
              applyPayment(item, payment);
              statusHistory.push(item.status);
            }

            // Verify monotonic progression: OPEN → PARTIAL → CLOSED
            // Status can only stay the same or move forward, never backward
            const statusOrder: Record<ApArStatus, number> = {
              OPEN: 0,
              PARTIAL: 1,
              CLOSED: 2,
            };

            for (let i = 1; i < statusHistory.length; i++) {
              if (statusOrder[statusHistory[i]] < statusOrder[statusHistory[i - 1]]) {
                return false; // Status went backward — violation!
              }
            }
            return true;
          },
        ),
        { numRuns: 1000 },
      );
    });

    it('CN reduction and payment produce same status for same remaining amount', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(100), max: Math.fround(1000000), noNaN: true }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(99999), noNaN: true }),
          (originalAmount, reductionAmount) => {
            const roundedOriginal = Math.round(originalAmount * 100) / 100;
            const roundedReduction = Math.round(reductionAmount * 100) / 100;
            if (roundedOriginal <= 0 || roundedReduction <= 0) return true;
            if (roundedReduction >= roundedOriginal) return true;

            // Apply as payment
            const itemPayment = createOpenItem(roundedOriginal);
            applyPayment(itemPayment, roundedReduction);

            // Apply as CN reduction
            const itemCn = createOpenItem(roundedOriginal);
            applyCnReduction(itemCn, roundedReduction);

            // Both should produce the same status
            return itemPayment.status === itemCn.status &&
              itemPayment.remainingAmount === itemCn.remainingAmount;
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
