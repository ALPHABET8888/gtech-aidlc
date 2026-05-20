import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { APOpenItem, ApArStatus, Prisma } from '@prisma/client';

export interface FindApOpenItemsOptions {
  vendorId?: string;
  status?: ApArStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class ApOpenItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.APOpenItemCreateInput): Promise<APOpenItem> {
    return this.prisma.aPOpenItem.create({ data });
  }

  async findById(id: string): Promise<APOpenItem | null> {
    return this.prisma.aPOpenItem.findUnique({
      where: { id },
      include: { allocations: true },
    });
  }

  async findMany(options: FindApOpenItemsOptions = {}): Promise<{
    data: APOpenItem[];
    total: number;
  }> {
    const { vendorId, status, page = 1, limit = 20 } = options;
    const where: Prisma.APOpenItemWhereInput = {};

    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.aPOpenItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { allocations: true },
      }),
      this.prisma.aPOpenItem.count({ where }),
    ]);

    return { data, total };
  }

  async findByTxId(txId: string): Promise<APOpenItem | null> {
    return this.prisma.aPOpenItem.findFirst({
      where: { txId },
      include: { allocations: true },
    });
  }

  async findOpenByVendor(vendorId: string): Promise<APOpenItem[]> {
    return this.prisma.aPOpenItem.findMany({
      where: { vendorId, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'asc' },
      include: { allocations: true },
    });
  }

  async update(
    id: string,
    data: Prisma.APOpenItemUpdateInput,
  ): Promise<APOpenItem> {
    return this.prisma.aPOpenItem.update({ where: { id }, data });
  }

  async updateRemainingAndStatus(
    id: string,
    remainingAmount: Prisma.Decimal,
    status: ApArStatus,
  ): Promise<APOpenItem> {
    return this.prisma.aPOpenItem.update({
      where: { id },
      data: { remainingAmount, status },
    });
  }
}
