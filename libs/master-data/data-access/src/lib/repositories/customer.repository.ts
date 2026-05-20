import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';

export interface CustomerFilters {
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
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new Customer.
   */
  async create(data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  /**
   * Find a Customer by ID.
   */
  async findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  /**
   * Find a Customer by code.
   */
  async findByCode(code: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { code } });
  }

  /**
   * Find many Customers with filters and pagination.
   */
  async findMany(
    filters: CustomerFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Customer>> {
    const where = this.buildWhereClause(filters);
    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
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
   * Update a Customer by ID.
   */
  async update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }

  /**
   * Soft-delete a Customer by setting isActive to false.
   */
  async softDelete(id: string): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private buildWhereClause(filters: CustomerFilters): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {};

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
