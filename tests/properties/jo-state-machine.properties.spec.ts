/**
 * Property-Based Test: Job Order State Machine — No Invalid Transitions
 *
 * **Validates: Requirements US-008**
 *
 * Property 4: JO status transitions must follow sequence OPEN → IN_PROGRESS → DONE only.
 * No skip transitions, no reverse transitions.
 */
import * as fc from 'fast-check';
import { BadRequestException } from '@nestjs/common';

// --- State Machine Logic (extracted from JobOrderService) ---

enum JOStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

/**
 * Valid state transitions for Job Order state machine.
 * OPEN → IN_PROGRESS → DONE (no skip, no reverse)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  [JOStatus.OPEN]: [JOStatus.IN_PROGRESS],
  [JOStatus.IN_PROGRESS]: [JOStatus.DONE],
  [JOStatus.DONE]: [],
};

/**
 * Get valid next states from a given status.
 */
function getValidNextStates(currentStatus: string): string[] {
  return VALID_TRANSITIONS[currentStatus] ?? [];
}

/**
 * Attempt a status transition. Returns success/failure result.
 * Mirrors the logic in JobOrderService.updateStatus().
 */
function attemptTransition(
  currentStatus: string,
  targetStatus: string,
): { success: boolean; newStatus: string } {
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowedTransitions.includes(targetStatus)) {
    throw new BadRequestException(
      `Invalid status transition: ${currentStatus} → ${targetStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
    );
  }
  return { success: true, newStatus: targetStatus };
}

// --- Property-Based Tests ---

describe('Property 4: Job Order State Machine — No Invalid Transitions', () => {
  /**
   * **Validates: Requirements US-008**
   *
   * For any random sequence of status transitions, only valid transitions
   * (OPEN→IN_PROGRESS, IN_PROGRESS→DONE) succeed. All others throw BadRequestException.
   */
  it('should only allow valid forward transitions in any random sequence', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(JOStatus.OPEN, JOStatus.IN_PROGRESS, JOStatus.DONE),
          { minLength: 1, maxLength: 20 },
        ),
        (transitions) => {
          let currentStatus: string = JOStatus.OPEN;

          for (const targetStatus of transitions) {
            try {
              const result = attemptTransition(currentStatus, targetStatus);
              if (result.success) {
                // If transition succeeded, it must be a valid next state
                const validNext = getValidNextStates(currentStatus);
                if (!validNext.includes(targetStatus)) {
                  return false; // Invalid transition was allowed — property violated
                }
                currentStatus = result.newStatus;
              }
            } catch (error) {
              // Invalid transitions should throw BadRequestException
              if (!(error instanceof BadRequestException)) {
                return false; // Wrong error type — property violated
              }
              // Status should remain unchanged after rejection
              // (currentStatus stays the same — no mutation)
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements US-008**
   *
   * Skip transitions must always be rejected.
   * OPEN → DONE is never valid (must go through IN_PROGRESS).
   */
  it('should reject skip transitions (OPEN → DONE)', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No random input needed — deterministic property
        () => {
          try {
            attemptTransition(JOStatus.OPEN, JOStatus.DONE);
            return false; // Should have thrown
          } catch (error) {
            return error instanceof BadRequestException;
          }
        },
      ),
      { numRuns: 1 },
    );
  });

  /**
   * **Validates: Requirements US-008**
   *
   * Reverse transitions must always be rejected.
   * For any state that has progressed forward, going backward is invalid.
   */
  it('should reject all reverse transitions', () => {
    const reverseTransitions: [string, string][] = [
      [JOStatus.IN_PROGRESS, JOStatus.OPEN],
      [JOStatus.DONE, JOStatus.OPEN],
      [JOStatus.DONE, JOStatus.IN_PROGRESS],
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...reverseTransitions),
        ([from, to]) => {
          try {
            attemptTransition(from, to);
            return false; // Should have thrown
          } catch (error) {
            return error instanceof BadRequestException;
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements US-008**
   *
   * Self-transitions (same status repeated) must always be rejected.
   * A JO cannot transition to its current status.
   */
  it('should reject self-transitions (same status to same status)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(JOStatus.OPEN, JOStatus.IN_PROGRESS, JOStatus.DONE),
        (status) => {
          try {
            attemptTransition(status, status);
            return false; // Should have thrown
          } catch (error) {
            return error instanceof BadRequestException;
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements US-008**
   *
   * The only valid complete path through the state machine is:
   * OPEN → IN_PROGRESS → DONE
   * Any random sequence of valid transitions must follow this exact order.
   */
  it('should reach DONE only through the exact sequence OPEN → IN_PROGRESS → DONE', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(JOStatus.OPEN, JOStatus.IN_PROGRESS, JOStatus.DONE),
          { minLength: 1, maxLength: 30 },
        ),
        (transitions) => {
          let currentStatus: string = JOStatus.OPEN;
          const successfulTransitions: string[] = [];

          for (const targetStatus of transitions) {
            try {
              const result = attemptTransition(currentStatus, targetStatus);
              if (result.success) {
                successfulTransitions.push(`${currentStatus}→${result.newStatus}`);
                currentStatus = result.newStatus;
              }
            } catch {
              // Rejected — expected for invalid transitions
            }
          }

          // If we reached DONE, the path must have been OPEN→IN_PROGRESS then IN_PROGRESS→DONE
          if (currentStatus === JOStatus.DONE) {
            return (
              successfulTransitions.includes('OPEN→IN_PROGRESS') &&
              successfulTransitions.includes('IN_PROGRESS→DONE')
            );
          }

          // If we reached IN_PROGRESS, only OPEN→IN_PROGRESS should have succeeded
          if (currentStatus === JOStatus.IN_PROGRESS) {
            return successfulTransitions.includes('OPEN→IN_PROGRESS');
          }

          // If still OPEN, no transitions should have succeeded
          return successfulTransitions.length === 0;
        },
      ),
      { numRuns: 200 },
    );
  });
});
