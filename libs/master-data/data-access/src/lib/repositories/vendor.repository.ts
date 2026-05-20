import { Injectable } from '@nestjs/common';
import { Vendor, Prisma } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';

export interface VendorFilters {
  code?: string;
  name?: string;
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
export class VendorRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Vendor.
   */
  async create(data: Prisma.VendorCreateInput): Promise<Vendor> {
    return this.prisma.vendor.create({ data });
  }

  /**
   * Find a Vendor by ID.
   */
  async findById(id: string): Promise<Vendor | null> {
    return this.prisma.vendor.findUnique({ where: { id } });
  }

  /**
   * Find a Vendor by code.
   */
  async findByCode(code: string): Promise<Vendor | null> {
    return this.prisma.vendor.findUnique({ where: { code } });
  }

  /**
   * Find many Vendors with filters and pagination.
   */
  async findMany(
    filters: VendorFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Vendor>> {
    const where = this.buildWhereClause(filters);
    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vendor.count({ where }),
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
   * Update a Vendor by ID.
   */
  async update(id: string, data: Prisma.VendorUpdateInput): Promise<Vendor> {
    return this.prisma.vendor.update({ where: { id }, data });
  }

  /**
   * Soft-delete a Vendor by setting isActive to false.
   */
  async softDelete(id: string): Promise<Vendor> {
    return this.prisma.vendor.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private buildWhereClause(filters: VendorFilters): Prisma.VendorWhereInput {
    const where: Prisma.VendorWhereInput = {};

    if (filters.code) {
      where.code = { contains: filters.code, mode: 'insensitive' };
    }
    if (filters.name) {
      where.name = { contains: filters.name, mode: 'insensitive' };
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return where;
  }
}
