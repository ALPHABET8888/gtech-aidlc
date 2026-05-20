import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { JobOrder, JOStatus, Prisma } from '@prisma/client';

export interface FindJobOrdersOptions {
  status?: JOStatus;
  customerId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class JobOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.JobOrderCreateInput): Promise<JobOrder> {
    return this.prisma.jobOrder.create({ data });
  }

  async findById(id: string): Promise<JobOrder | null> {
    return this.prisma.jobOrder.findUnique({ where: { id } });
  }

  async findByJoNumber(joNumber: string): Promise<JobOrder | null> {
    return this.prisma.jobOrder.findUnique({ where: { joNumber } });
  }

  async findMany(options: FindJobOrdersOptions = {}): Promise<{
    data: JobOrder[];
    total: number;
  }> {
    const { status, customerId, page = 1, limit = 20 } = options;
    const where: Prisma.JobOrderWhereInput = {};

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [data, total] = await Promise.all([
      this.prisma.jobOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.jobOrder.count({ where }),
    ]);

    return { data, total };
  }

  async updateStatus(id: string, status: JOStatus): Promise<JobOrder> {
    return this.prisma.jobOrder.update({
      where: { id },
      data: { status },
    });
  }

  async update(
    id: string,
    data: Prisma.JobOrderUpdateInput,
  ): Promise<JobOrder> {
    return this.prisma.jobOrder.update({ where: { id }, data });
  }
}
