import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { AROpenItem, ApArStatus, Prisma } from '@prisma/client';

export interface FindArOpenItemsOptions {
  customerId?: string;
  status?: ApArStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class ArOpenItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AROpenItemCreateInput): Promise<AROpenItem> {
    return this.prisma.aROpenItem.create({ data });
  }

  async findById(id: string): Promise<AROpenItem | null> {
    return this.prisma.aROpenItem.findUnique({
      where: { id },
      include: { allocations: true },
    });
  }

  async findByTxId(txId: string): Promise<AROpenItem | null> {
    return this.prisma.aROpenItem.findFirst({
      where: { txId },
    });
  }

  async findMany(options: FindArOpenItemsOptions = {}): Promise<{
    data: AROpenItem[];
    total: number;
  }> {
    const { customerId, status, page = 1, limit = 20 } = options;
    const where: Prisma.AROpenItemWhereInput = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.aROpenItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { allocations: true },
      }),
      this.prisma.aROpenItem.count({ where }),
    ]);

    return { data, total };
  }

  async findOpenByCustomer(customerId: string): Promise<AROpenItem[]> {
    return this.prisma.aROpenItem.findMany({
      where: { customerId, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'asc' },
      include: { allocations: true },
    });
  }

  async update(
    id: string,
    data: Prisma.AROpenItemUpdateInput,
  ): Promise<AROpenItem> {
    return this.prisma.aROpenItem.update({ where: { id }, data });
  }

  async updateRemainingAndStatus(
    id: string,
    remainingAmount: Prisma.Decimal,
    status: ApArStatus,
  ): Promise<AROpenItem> {
    return this.prisma.aROpenItem.update({
      where: { id },
      data: { remainingAmount, status },
    });
  }
}
