import { Injectable } from '@nestjs/common';
import { Warehouse, Prisma } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';

export interface WarehouseFilters {
  code?: string;
  name?: string;
  location?: string;
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
export class WarehouseRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Warehouse.
   */
  async create(data: Prisma.WarehouseCreateInput): Promise<Warehouse> {
    return this.prisma.warehouse.create({ data });
  }

  /**
   * Find a Warehouse by ID.
   */
  async findById(id: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  /**
   * Find a Warehouse by code.
   */
  async findByCode(code: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({ where: { code } });
  }

  /**
   * Find many Warehouses with filters and pagination.
   */
  async findMany(
    filters: WarehouseFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Warehouse>> {
    const where = this.buildWhereClause(filters);
    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.warehouse.count({ where }),
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
   * Update a Warehouse by ID.
   */
  async update(id: string, data: Prisma.WarehouseUpdateInput): Promise<Warehouse> {
    return this.prisma.warehouse.update({ where: { id }, data });
  }

  /**
   * Soft-delete a Warehouse by setting isActive to false.
   */
  async softDelete(id: string): Promise<Warehouse> {
    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private buildWhereClause(filters: WarehouseFilters): Prisma.WarehouseWhereInput {
    const where: Prisma.WarehouseWhereInput = {};

    if (filters.code) {
      where.code = { contains: filters.code, mode: 'insensitive' };
    }
    if (filters.name) {
      where.name = { contains: filters.name, mode: 'insensitive' };
    }
    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return where;
  }
}
