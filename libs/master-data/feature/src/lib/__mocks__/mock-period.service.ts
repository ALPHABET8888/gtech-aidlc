import { PeriodStatus } from '@autoflow/shared-types';
import type { IPeriodService, PeriodInfo } from '@autoflow/shared-types';

/**
 * Mock Period Service for downstream unit testing.
 * validatePeriodOpen always resolves (period is open).
 * Returns realistic sample periods matching seed data (3 periods: 2 open, 1 closed).
 */
export class MockPeriodService implements IPeriodService {
  private readonly samplePeriods: PeriodInfo[] = [
    {
      period: '2024-01',
      status: PeriodStatus.OPEN,
      closedAt: null,
      closedBy: null,
    },
    {
      period: '2024-02',
      status: PeriodStatus.OPEN,
      closedAt: null,
      closedBy: null,
    },
    {
      period: '2023-12',
      status: PeriodStatus.CLOSED,
      closedAt: '2024-01-05T09:00:00.000Z',
      closedBy: 'user-cfo-001',
    },
  ];

  /**
   * Always resolves successfully — period is open.
   * In production, this would throw PeriodLockedException if period is CLOSED.
   */
  async validatePeriodOpen(_period: string): Promise<void> {
    // No-op: always resolves (period open for testing)
    return;
  }

  /**
   * Returns all sample periods.
   */
  async getAll(): Promise<PeriodInfo[]> {
    return [...this.samplePeriods];
  }

  /**
   * Simulates creating a new period — returns the new period info.
   */
  async create(period: string, openedBy: string): Promise<PeriodInfo> {
    return {
      period,
      status: PeriodStatus.OPEN,
      closedAt: null,
      closedBy: null,
    };
  }

  /**
   * Simulates closing a period — returns updated period info.
   */
  async close(id: string, closedBy: string): Promise<PeriodInfo> {
    return {
      period: id,
      status: PeriodStatus.CLOSED,
      closedAt: new Date().toISOString(),
      closedBy,
    };
  }
}
