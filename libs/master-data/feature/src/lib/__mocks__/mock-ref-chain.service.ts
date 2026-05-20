import type { IRefChainService, IRefField } from '@autoflow/shared-types';

type RefField = IRefField;

/**
 * Mock Reference Chain Service for downstream unit testing.
 * validateRefChain always resolves (chain is valid).
 * registerRule is a no-op (rule registration succeeds silently).
 */
export class MockRefChainService implements IRefChainService {
  /** Tracks registered rules for test assertions if needed */
  private readonly registeredRules: Map<string, RefField[]> = new Map();

  /**
   * No-op: registers the rule silently.
   * Other teams can assert on registeredRules if needed.
   */
  registerRule(txType: string, requiredRefs: RefField[]): void {
    const existing = this.registeredRules.get(txType) ?? [];
    const merged = [...new Set([...existing, ...requiredRefs])];
    this.registeredRules.set(txType, merged);
  }

  /**
   * Always resolves successfully — reference chain is valid.
   * In production, this would throw RefChainInvalidException with violation details.
   */
  async validateRefChain(
    _txType: string,
    _refFields: Partial<Record<RefField, string | null>>,
  ): Promise<void> {
    // No-op: always resolves (ref chain valid for testing)
    return;
  }

  /**
   * Utility for tests to inspect registered rules.
   */
  getRegisteredRules(): Map<string, RefField[]> {
    return new Map(this.registeredRules);
  }
}
