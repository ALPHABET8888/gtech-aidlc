import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Period } from '@prisma/client';
import { PeriodRepository } from '@autoflow/master-data-data-access';
import { PeriodLockedException } from '@autoflow/shared-errors';
import { IPeriodService } from '@autoflow/shared-types';

/**
 * Service for managing accounting periods and enforcing period lock.
 * Provides validation for TX posting and CRUD operations for periods.
 */
@Injectable()
export class PeriodService implements IPeriodService {
  constructor(private readonly periodRepository: PeriodRepository) {}

  /**
   * Validate that a period is open and can accept new postings.
   * Throws PeriodLockedException if the period is CLOSED.
   * Throws NotFoundException if the period does not exist.
   */
  async validatePeriodOpen(period: string): Promise<void> {
    const periodRecord = await this.periodRepository.findByPeriod(period);

    if (!periodRecord) {
      throw new NotFoundException(`Period ${period} not found`);
    }

    if (periodRecord.status === 'CLOSED') {
      throw new PeriodLockedException(period);
    }
  }

  /**
   * List all periods.
   */
  async listPeriods(): Promise<Period[]> {
    return this.periodRepository.findAll();
  }

  /**
   * Open a new period.
   * Throws ConflictException if period already exists.
   */
  async openPeriod(period: string, openedBy: string): Promise<Period> {
    const existing = await this.periodRepository.findByPeriod(period);
    if (existing) {
      throw new ConflictException(`Period ${period} already exists`);
    }

    return this.periodRepository.create({
      period,
      status: 'OPEN',
      openedBy,
      openedAt: new Date(),
    });
  }

  /**
   * Close an existing period.
   * Throws NotFoundException if the period does not exist.
   * Throws ConflictException if the period is already closed.
   */
  async closePeriod(id: string, closedBy: string): Promise<Period> {
    const periodRecord = await this.periodRepository.findById(id);

    if (!periodRecord) {
      throw new NotFoundException(`Period with ID ${id} not found`);
    }

    if (periodRecord.status === 'CLOSED') {
      throw new ConflictException(
        `Period ${periodRecord.period} is already closed`,
      );
    }

    return this.periodRepository.updateStatus(
      id,
      'CLOSED',
      closedBy,
      new Date(),
    );
  }

  // ── IPeriodService interface methods ──

  /**
   * Get current period in YYYY-MM format.
   */
  getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get all periods — satisfies IPeriodService.getAll().
   */
  async getAll(): Promise<Period[]> {
    return this.listPeriods();
  }

  /**
   * Create/open a new period — satisfies IPeriodService.create().
   */
  async create(period: string, openedBy: string): Promise<Period> {
    return this.openPeriod(period, openedBy);
  }

  /**
   * Close a period — satisfies IPeriodService.close().
   */
  async close(id: string, closedBy: string): Promise<Period> {
    return this.closePeriod(id, closedBy);
  }
}
