import { Injectable } from '@nestjs/common';
import { Item, Prisma } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';

export interface ItemFilters {
  code?: string;
  name?: string;
  category?: string;
  isActive?: boolean;
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
export class ItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Item.
   */
  async create(data: Prisma.ItemCreateInput): Promise<Item> {
    return this.prisma.item.create({ data });
  }

  /**
   * Find an Item by ID.
   */
  async findById(id: string): Promise<Item | null> {
    return this.prisma.item.findUnique({ where: { id } });
  }

  /**
   * Find an Item by code.
   */
  async findByCode(code: string): Promise<Item | null> {
    return this.prisma.item.findUnique({ where: { code } });
  }

  /**
   * Find many Items with filters and pagination.
   */
  async findMany(
    filters: ItemFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Item>> {
    const where = this.buildWhereClause(filters);
    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.item.count({ where }),
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
   * Update an Item by ID.
   */
  async update(id: string, data: Prisma.ItemUpdateInput): Promise<Item> {
    return this.prisma.item.update({ where: { id }, data });
  }

  /**
   * Soft-delete an Item by setting isActive to false.
   */
  async softDelete(id: string): Promise<Item> {
    return this.prisma.item.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private buildWhereClause(filters: ItemFilters): Prisma.ItemWhereInput {
    const where: Prisma.ItemWhereInput = {};

    if (filters.code) {
      where.code = { contains: filters.code, mode: 'insensitive' };
    }
    if (filters.name) {
      where.name = { contains: filters.name, mode: 'insensitive' };
    }
    if (filters.category) {
      where.category = { contains: filters.category, mode: 'insensitive' };
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return where;
  }
}
