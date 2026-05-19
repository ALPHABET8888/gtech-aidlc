import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { CountSession, CountLine, CountSessionStatus, Prisma } from '@prisma/client';

export interface CreateCountSessionInput {
  warehouseId: string;
  initiatedBy: string;
  notes?: string;
}

export interface CreateCountLineInput {
  sessionId: string;
  itemId: string;
  systemQty: number;
  systemMa: number;
}

export interface UpdateCountLineInput {
  physicalQty?: number;
  difference?: number;
  reasonCode?: string;
  isFrozen?: boolean;
  txId?: string;
}

export interface CountSessionQueryParams {
  warehouseId?: string;
  status?: CountSessionStatus;
  page?: number;
  limit?: number;
}

export type CountSessionWithLines = CountSession & { lines: CountLine[] };

@Injectable()
export class CountSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCountSessionInput): Promise<CountSession> {
    return this.prisma.countSession.create({
      data: {
        warehouseId: input.warehouseId,
        initiatedBy: input.initiatedBy,
        notes: input.notes,
        status: CountSessionStatus.INITIATED,
      },
    });
  }

  async findById(id: string): Promise<CountSessionWithLines | null> {
    return this.prisma.countSession.findUnique({
      where: { id },
      include: { lines: true },
    });
  }

  async findByWarehouseAndStatus(
    params: CountSessionQueryParams,
  ): Promise<{ data: CountSession[]; total: number }> {
    const { warehouseId, status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.CountSessionWhereInput = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.countSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { initiatedAt: 'desc' },
        include: { lines: true },
      }),
      this.prisma.countSession.count({ where }),
    ]);

    return { data, total };
  }

  async updateStatus(
    id: string,
    status: CountSessionStatus,
    additionalData?: Partial<Pick<CountSession, 'approvedBy' | 'approvedAt' | 'completedAt'>>,
  ): Promise<CountSession> {
    return this.prisma.countSession.update({
      where: { id },
      data: {
        status,
        ...additionalData,
      },
    });
  }

  async createLine(input: CreateCountLineInput): Promise<CountLine> {
    return this.prisma.countLine.create({
      data: {
        sessionId: input.sessionId,
        itemId: input.itemId,
        systemQty: input.systemQty,
        systemMa: input.systemMa,
        isFrozen: true,
      },
    });
  }

  async createLines(inputs: CreateCountLineInput[]): Promise<Prisma.BatchPayload> {
    return this.prisma.countLine.createMany({
      data: inputs.map((input) => ({
        sessionId: input.sessionId,
        itemId: input.itemId,
        systemQty: input.systemQty,
        systemMa: input.systemMa,
        isFrozen: true,
      })),
    });
  }

  async findLineById(lineId: string): Promise<CountLine | null> {
    return this.prisma.countLine.findUnique({
      where: { id: lineId },
    });
  }

  async updateLine(lineId: string, input: UpdateCountLineInput): Promise<CountLine> {
    return this.prisma.countLine.update({
      where: { id: lineId },
      data: input,
    });
  }

  async findFrozenLinesByItem(itemId: string): Promise<CountLine[]> {
    return this.prisma.countLine.findMany({
      where: {
        itemId,
        isFrozen: true,
      },
    });
  }

  async findLinesBySessionId(sessionId: string): Promise<CountLine[]> {
    return this.prisma.countLine.findMany({
      where: { sessionId },
    });
  }
}
