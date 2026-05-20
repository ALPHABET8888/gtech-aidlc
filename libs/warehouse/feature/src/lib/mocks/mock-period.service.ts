import { Injectable } from '@nestjs/common';
import { IPeriodService, PeriodInfo, PeriodStatus } from '@autoflow/shared-types';

/**
 * Exception thrown when attempting to post to a closed period.
 */
export class PeriodLockedException extends Error {
  constructor(public readonly period: string) {
    super(`Period ${period} is closed. Cannot post transactions to a closed period.`);
    this.name = 'PeriodLockedException';
  }
}

/**
 * Mock implementation of IPeriodService.
 * Always returns OPEN for the current period by default.
 * Supports configuring closed periods for testing.
 */
@Injectable()
export class MockPeriodService implements IPeriodService {
  private readonly closedPeriods: Map<string, PeriodInfo> = new Map();

  /**
   * Validate that a period is open for posting.
   * @throws PeriodLockedException if period is closed
   */
  async validatePeriodOpen(period: string): Promise<void> {
    const info = this.closedPeriods.get(period);
    if (info && info.status === PeriodStatus.CLOSED) {
      throw new PeriodLockedException(period);
    }
  }

  /**
   * Get current active period in YYYY-MM format.
   */
  getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  async getAll(): Promise<PeriodInfo[]> {
    return Array.from(this.closedPeriods.values());
  }

  async create(period: string, _openedBy: string): Promise<PeriodInfo> {
    return { period, status: PeriodStatus.OPEN, closedAt: null, closedBy: null };
  }

  async close(id: string, closedBy: string): Promise<PeriodInfo> {
    const info: PeriodInfo = {
      period: id,
      status: PeriodStatus.CLOSED,
      closedAt: new Date().toISOString(),
      closedBy,
    };
    this.closedPeriods.set(id, info);
    return info;
  }

  /**
   * Close a period — prevents any future postings.
   */
  async closePeriod(period: string, closedBy: string): Promise<PeriodInfo> {
    return this.close(period, closedBy);
  }

  /**
   * Get period information.
   */
  async getPeriodInfo(period: string): Promise<PeriodInfo | null> {
    const closed = this.closedPeriods.get(period);
    if (closed) {
      return closed;
    }
    return { period, status: PeriodStatus.OPEN, closedAt: null, closedBy: null };
  }

  /**
   * Clear all closed periods (for testing).
   */
  clear(): void {
    this.closedPeriods.clear();
  }
}
