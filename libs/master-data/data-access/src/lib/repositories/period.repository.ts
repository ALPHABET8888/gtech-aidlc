import { Injectable } from '@nestjs/common';
import { Period, Prisma } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';

/**
 * Repository for Period data access.
 * Handles CRUD operations for accounting periods.
 */
@Injectable()
export class PeriodRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a period by its period string (YYYY-MM).
   */
  async findByPeriod(period: string): Promise<Period | null> {
    return this.prisma.period.findUnique({ where: { period } });
  }

  /**
   * Find a period by ID.
   */
  async findById(id: string): Promise<Period | null> {
    return this.prisma.period.findUnique({ where: { id } });
  }

  /**
   * List all periods ordered by period string descending.
   */
  async findAll(): Promise<Period[]> {
    return this.prisma.period.findMany({
      orderBy: { period: 'desc' },
    });
  }

  /**
   * Create a new period.
   */
  async create(data: Prisma.PeriodUncheckedCreateInput): Promise<Period> {
    return this.prisma.period.create({ data });
  }

  /**
   * Update period status (e.g., OPEN → CLOSED).
   */
  async updateStatus(
    id: string,
    status: string,
    closedBy?: string,
    closedAt?: Date,
  ): Promise<Period> {
    return this.prisma.period.update({
      where: { id },
      data: {
        status,
        ...(closedBy && { closedBy }),
        ...(closedAt && { closedAt }),
      },
    });
  }
}
