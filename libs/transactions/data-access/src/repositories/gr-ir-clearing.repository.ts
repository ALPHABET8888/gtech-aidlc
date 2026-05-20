import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { GrIrClearing, ClearingStatus, Prisma } from '@prisma/client';

export interface FindClearingsOptions {
  vendorId?: string;
  status?: ClearingStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class GrIrClearingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.GrIrClearingCreateInput): Promise<GrIrClearing> {
    return this.prisma.grIrClearing.create({ data });
  }

  async findById(id: string): Promise<GrIrClearing | null> {
    return this.prisma.grIrClearing.findUnique({ where: { id } });
  }

  async findByGrReturnTxId(grReturnTxId: string): Promise<GrIrClearing | null> {
    return this.prisma.grIrClearing.findFirst({
      where: { grReturnTxId },
    });
  }

  async findMany(options: FindClearingsOptions = {}): Promise<{
    data: GrIrClearing[];
    total: number;
  }> {
    const { vendorId, status, page = 1, limit = 20 } = options;
    const where: Prisma.GrIrClearingWhereInput = {};

    if (vendorId) where.vendorId = vendorId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.grIrClearing.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.grIrClearing.count({ where }),
    ]);

    return { data, total };
  }

  async findOpenByVendor(vendorId: string): Promise<GrIrClearing[]> {
    return this.prisma.grIrClearing.findMany({
      where: { vendorId, status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async close(
    id: string,
    closedByTxId: string,
    closedByType: string,
    ppvAmount?: Prisma.Decimal,
  ): Promise<GrIrClearing> {
    return this.prisma.grIrClearing.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedByTxId,
        closedByType,
        ppvAmount: ppvAmount ?? null,
        closedAt: new Date(),
      },
    });
  }
}
