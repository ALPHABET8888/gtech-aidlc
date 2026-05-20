import { Injectable } from '@nestjs/common';
import { IPeriodService, PeriodStatus } from '@autoflow/shared-types';
import { MOCK_PERIODS } from './mock-data';

/**
 * Mock implementation of IPeriodService for the Reports module.
 * Returns period status (OPEN/CLOSED) from mock data.
 * Will be replaced with real service when Period management is integrated.
 */
@Injectable()
export class MockPeriodService implements IPeriodService {
  async validatePeriodOpen(period: string): Promise<void> {
    const periodInfo = MOCK_PERIODS.find((p) => p.period === period);

    // If period not found, treat as OPEN (fail-open for mocks)
    if (!periodInfo) {
      return;
    }

    if (periodInfo.status !== 'OPEN') {
      throw new Error(`งวดบัญชี ${period} ถูกปิดแล้ว`);
    }
  }

  getCurrentPeriod(): string {
    // Return the latest open period
    const openPeriod = MOCK_PERIODS.find((p) => p.status === 'OPEN');
    return openPeriod?.period ?? '2025-01';
  }

  async getAll(): Promise<unknown[]> {
    return MOCK_PERIODS.map((p) => ({
      period: p.period,
      status: p.status === 'OPEN' ? PeriodStatus.OPEN : PeriodStatus.CLOSED,
      closedAt: p.closedAt,
      closedBy: p.closedBy,
    }));
  }

  async create(period: string, openedBy: string): Promise<unknown> {
    return {
      period,
      status: PeriodStatus.OPEN,
      openedBy,
      openedAt: new Date().toISOString(),
    };
  }

  async close(id: string, closedBy: string): Promise<unknown> {
    return {
      id,
      status: PeriodStatus.CLOSED,
      closedAt: new Date().toISOString(),
      closedBy,
    };
  }
}
