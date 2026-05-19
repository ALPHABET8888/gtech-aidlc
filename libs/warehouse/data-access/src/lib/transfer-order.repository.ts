import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { TransferOrder, TransferLine, TransferStatus, Prisma } from '@prisma/client';

export interface CreateTransferOrderInput {
  sourceWarehouseId: string;
  destWarehouseId: string;
  initiatedBy: string;
  notes?: string;
}

export interface CreateTransferLineInput {
  transferId: string;
  itemId: string;
  qty: number;
  unitCost: number;
}

export interface TransferOrderQueryParams {
  sourceWarehouseId?: string;
  destWarehouseId?: string;
  status?: TransferStatus;
  page?: number;
  limit?: number;
}

export type TransferOrderWithLines = TransferOrder & { lines: TransferLine[] };

@Injectable()
export class TransferOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateTransferOrderInput): Promise<TransferOrder> {
    return this.prisma.transferOrder.create({
      data: {
        sourceWarehouseId: input.sourceWarehouseId,
        destWarehouseId: input.destWarehouseId,
        initiatedBy: input.initiatedBy,
        notes: input.notes,
        status: TransferStatus.DRAFT,
      },
    });
  }

  async findById(id: string): Promise<TransferOrderWithLines | null> {
    return this.prisma.transferOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
  }

  async findBySourceOrDestWarehouse(
    params: TransferOrderQueryParams,
  ): Promise<{ data: TransferOrder[]; total: number }> {
    const { sourceWarehouseId, destWarehouseId, status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.TransferOrderWhereInput = {};
    if (sourceWarehouseId) where.sourceWarehouseId = sourceWarehouseId;
    if (destWarehouseId) where.destWarehouseId = destWarehouseId;
    if (status) where.status = status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.transferOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { lines: true },
      }),
      this.prisma.transferOrder.count({ where }),
    ]);

    return { data, total };
  }

  async updateStatus(
    id: string,
    status: TransferStatus,
    additionalData?: Partial<Pick<TransferOrder, 'postedAt'>>,
  ): Promise<TransferOrder> {
    return this.prisma.transferOrder.update({
      where: { id },
      data: {
        status,
        ...additionalData,
      },
    });
  }

  async createLine(input: CreateTransferLineInput): Promise<TransferLine> {
    return this.prisma.transferLine.create({
      data: {
        transferId: input.transferId,
        itemId: input.itemId,
        qty: input.qty,
        unitCost: input.unitCost,
      },
    });
  }

  async createLines(inputs: CreateTransferLineInput[]): Promise<Prisma.BatchPayload> {
    return this.prisma.transferLine.createMany({
      data: inputs.map((input) => ({
        transferId: input.transferId,
        itemId: input.itemId,
        qty: input.qty,
        unitCost: input.unitCost,
      })),
    });
  }

  async updateLinesTxId(transferId: string, txId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.transferLine.updateMany({
      where: { transferId },
      data: { txId },
    });
  }

  async findLinesByTransferId(transferId: string): Promise<TransferLine[]> {
    return this.prisma.transferLine.findMany({
      where: { transferId },
    });
  }
}
