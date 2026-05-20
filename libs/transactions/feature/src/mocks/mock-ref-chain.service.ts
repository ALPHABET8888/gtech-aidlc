import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { TxType, IRefChainService, RefChainDto } from '@autoflow/shared-types';

/**
 * Mock implementation of IRefChainService.
 * Configurable to pass or throw RefChainInvalidException.
 * Default behavior: passes all validations.
 */
@Injectable()
export class MockRefChainService implements IRefChainService {
  /** Whether to fail all ref chain validations */
  private failAll = false;

  /** Specific TX types that should fail validation */
  private failingTypes: Set<TxType> = new Set();

  /** Custom error messages per TX type */
  private errorMessages: Map<TxType, string> = new Map();

  /**
   * Set whether all ref chain validations should fail.
   */
  setFailAll(fail: boolean): void {
    this.failAll = fail;
  }

  /**
   * Configure a specific TX type to fail ref chain validation.
   */
  setFailing(txType: TxType, errorMessage?: string): void {
    this.failingTypes.add(txType);
    if (errorMessage) {
      this.errorMessages.set(txType, errorMessage);
    }
  }

  /**
   * Configure a specific TX type to pass ref chain validation.
   */
  setPassing(txType: TxType): void {
    this.failingTypes.delete(txType);
    this.errorMessages.delete(txType);
  }

  async validateRefChain(txType: TxType, refs: RefChainDto): Promise<void> {
    if (this.failAll || this.failingTypes.has(txType)) {
      const message =
        this.errorMessages.get(txType) ??
        `Invalid reference chain for TX type ${txType}. Required references are missing or invalid.`;

      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'REF_CHAIN_INVALID',
          message,
          txType,
          refs,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  /**
   * Reset all configured values — useful for testing.
   */
  reset(): void {
    this.failAll = false;
    this.failingTypes.clear();
    this.errorMessages.clear();
  }
}
