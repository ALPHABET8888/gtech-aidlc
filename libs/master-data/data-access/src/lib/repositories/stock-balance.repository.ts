import { Injectable } from '@nestjs/common';
import { Prisma, StockBalance } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';

export interface StockBalanceFilters {
  itemId?: string;
  warehouseId?: string;
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

/**
 * Repository for StockBalance data access.
 * Provides pessimistic row locking via SELECT FOR UPDATE
 * to ensure atomic MA calculations during concurrent transactions.
 */
@Injectable()
export class StockBalanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find many stock balances with optional filters and pagination.
   */
  async findMany(
    filters: StockBalanceFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<StockBalance>> {
    const where = this.buildWhereClause(filters);
    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.stockBalance.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          item: { select: { id: true, code: true, name: true, unit: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.stockBalance.count({ where }),
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
   * Find stock balance by item and warehouse (no lock).
   * Use for read-only queries where consistency under concurrency is not critical.
   */
  async findByItemWarehouse(
    itemId: string,
    warehouseId: string,
  ): Promise<StockBalance | null> {
    return this.prisma.stockBalance.findUnique({
      where: {
        idx_stock_balance_item_wh: { itemId, warehouseId },
      },
    });
  }

  /**
   * Find stock balance by item and warehouse with pessimistic row lock (SELECT FOR UPDATE).
   * Must be called within a Prisma interactive transaction ($transaction) to hold the lock.
   * Used by MaCalculationService to prevent concurrent MA recalculation.
   */
  async findByItemWarehouseForUpdate(
    itemId: string,
    warehouseId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StockBalance | null> {
    const client = tx ?? this.prisma;

    const results = await client.$queryRaw<StockBalance[]>`
      SELECT
        id,
        item_id AS "itemId",
        warehouse_id AS "warehouseId",
        qty,
        total_value AS "totalValue",
        ma,
        is_frozen AS "isFrozen",
        last_tx_id AS "lastTxId",
        updated_at AS "updatedAt"
      FROM transactions.stock_balance
      WHERE item_id = ${itemId}::uuid
        AND warehouse_id = ${warehouseId}::uuid
      FOR UPDATE
    `;

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Upsert a stock balance record.
   * Creates if not exists, updates if already present for the item+warehouse pair.
   */
  async upsert(
    data: {
      itemId: string;
      warehouseId: string;
      qty: Prisma.Decimal | number;
      totalValue: Prisma.Decimal | number;
      ma: Prisma.Decimal | number;
      isFrozen?: boolean;
      lastTxId?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<StockBalance> {
    const client = tx ?? this.prisma;

    return client.stockBalance.upsert({
      where: {
        idx_stock_balance_item_wh: {
          itemId: data.itemId,
          warehouseId: data.warehouseId,
        },
      },
      create: {
        item: { connect: { id: data.itemId } },
        warehouse: { connect: { id: data.warehouseId } },
        qty: data.qty as any,
        totalValue: data.totalValue as any,
        ma: data.ma as any,
        isFrozen: data.isFrozen ?? false,
        ...(data.lastTxId && { lastTx: { connect: { id: data.lastTxId } } }),
      },
      update: {
        qty: data.qty as any,
        totalValue: data.totalValue as any,
        ma: data.ma as any,
        ...(data.isFrozen !== undefined && { isFrozen: data.isFrozen }),
        ...(data.lastTxId !== undefined && {
          lastTxId: data.lastTxId,
        }),
      },
    });
  }

  private buildWhereClause(filters: StockBalanceFilters): Prisma.StockBalanceWhereInput {
    const where: Prisma.StockBalanceWhereInput = {};

    if (filters.itemId) {
      where.itemId = filters.itemId;
    }
    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    return where;
  }
}
