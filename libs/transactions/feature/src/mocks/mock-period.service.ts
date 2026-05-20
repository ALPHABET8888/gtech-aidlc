import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { IPeriodService, PeriodInfo, PeriodStatus } from '@autoflow/shared-types';

/**
 * Mock implementation of IPeriodService.
 * Configurable to pass or throw PeriodLockedException.
 * Default behavior: all periods are OPEN.
 */
@Injectable()
export class MockPeriodService implements IPeriodService {
  /** Closed periods */
  private closedPeriods: Map<string, PeriodInfo> = new Map();

  /** Whether to fail all period validations */
  private failAll = false;

  /**
   * Configure a specific period as closed.
   */
  closePeriodMock(period: string, closedBy = 'system'): void {
    this.closedPeriods.set(period, {
      period,
      status: PeriodStatus.CLOSED,
      closedAt: new Date().toISOString(),
      closedBy,
    });
  }

  /**
   * Configure a specific period as open.
   */
  openPeriodMock(period: string): void {
    this.closedPeriods.delete(period);
  }

  /**
   * Set whether all period validations should fail.
   */
  setFailAll(fail: boolean): void {
    this.failAll = fail;
  }

  async validatePeriodOpen(period: string): Promise<boolean> {
    if (this.failAll) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'PERIOD_LOCKED',
          message: `Period ${period} is closed. No transactions can be posted.`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const info = this.closedPeriods.get(period);
    if (info) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'PERIOD_LOCKED',
          message: `Period ${period} is closed. No transactions can be posted.`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return true;
  }

  getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  async closePeriod(period: string, closedBy: string): Promise<PeriodInfo> {
    const info: PeriodInfo = {
      period,
      status: PeriodStatus.CLOSED,
      closedAt: new Date().toISOString(),
      closedBy,
    };
    this.closedPeriods.set(period, info);
    return info;
  }

  async getPeriodInfo(period: string): Promise<PeriodInfo | null> {
    const closed = this.closedPeriods.get(period);
    if (closed) {
      return closed;
    }
    return {
      period,
      status: PeriodStatus.OPEN,
      closedAt: null,
      closedBy: null,
    };
  }

  /**
   * Reset all configured values — useful for testing.
   */
  reset(): void {
    this.closedPeriods.clear();
    this.failAll = false;
  }
}
