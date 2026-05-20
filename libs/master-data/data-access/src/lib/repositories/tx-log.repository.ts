import { Injectable } from '@nestjs/common';
import { Prisma, TxLog, TxStatus } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';
import { ImmutableTxException } from '@autoflow/shared-errors';

/**
 * Valid status transitions for TX Log entries.
 * Enforces immutability: only DRAFT→POSTED or POSTED→VOIDED are allowed.
 */
const VALID_STATUS_TRANSITIONS: Record<TxStatus, TxStatus[]> = {
  [TxStatus.DRAFT]: [TxStatus.POSTED],
  [TxStatus.POSTED]: [TxStatus.VOIDED],
  [TxStatus.VOIDED]: [],
};

export interface TxLogFilters {
  txType?: string;
  txStatus?: TxStatus;
  period?: string;
  itemId?: string;
  warehouseId?: string;
  customerId?: string;
  vendorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class TxLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new TX Log entry.
   */
  async create(data: Prisma.TxLogCreateInput): Promise<TxLog> {
    return this.prisma.txLog.create({ data });
  }

  /**
   * Find a TX Log entry by ID.
   * Returns null if not found.
   */
  async findById(id: string): Promise<TxLog | null> {
    return this.prisma.txLog.findUnique({ where: { id } });
  }

  /**
   * Find many TX Log entries with filters and pagination.
   */
  async findMany(
    filters: TxLogFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<TxLog>> {
    const where = this.buildWhereClause(filters);
    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.txLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.txLog.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  /**
   * Update TX status with immutability enforcement.
   * Only allows: DRAFT→POSTED or POSTED→VOIDED.
   * Throws ImmutableTxException for invalid transitions.
   */
  async updateStatus(id: string, newStatus: TxStatus): Promise<TxLog> {
    const tx = await this.prisma.txLog.findUnique({ where: { id } });

    if (!tx) {
      throw new Error(`Transaction ${id} not found`);
    }

    const currentStatus = tx.txStatus;
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ImmutableTxException(id);
    }

    return this.prisma.txLog.update({
      where: { id },
      data: { txStatus: newStatus },
    });
  }

  private buildWhereClause(filters: TxLogFilters): Prisma.TxLogWhereInput {
    const where: Prisma.TxLogWhereInput = {};

    if (filters.txType) {
      where.txType = filters.txType as Prisma.EnumTxTypeFilter['equals'];
    }
    if (filters.txStatus) {
      where.txStatus = filters.txStatus;
    }
    if (filters.period) {
      where.period = filters.period;
    }
    if (filters.itemId) {
      where.itemId = filters.itemId;
    }
    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (filters.customerId) {
      where.customerId = filters.customerId;
    }
    if (filters.vendorId) {
      where.vendorId = filters.vendorId;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.txDate = {};
      if (filters.dateFrom) {
        where.txDate.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.txDate.lte = filters.dateTo;
      }
    }

    return where;
  }
}
