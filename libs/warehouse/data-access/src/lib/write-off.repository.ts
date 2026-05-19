import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { WriteOffRequest, WriteOffEvidence, WriteOffStatus, Prisma } from '@prisma/client';

export interface CreateWriteOffRequestInput {
  warehouseId: string;
  itemId: string;
  qty: number;
  unitCost: number;
  totalLoss: number;
  salvageValue?: number;
  reason: string;
  requestedBy: string;
}

export interface CreateWriteOffEvidenceInput {
  writeOffId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
}

export interface WriteOffQueryParams {
  warehouseId?: string;
  status?: WriteOffStatus;
  page?: number;
  limit?: number;
}

export type WriteOffRequestWithEvidence = WriteOffRequest & { evidence: WriteOffEvidence[] };

@Injectable()
export class WriteOffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateWriteOffRequestInput): Promise<WriteOffRequest> {
    return this.prisma.writeOffRequest.create({
      data: {
        warehouseId: input.warehouseId,
        itemId: input.itemId,
        qty: input.qty,
        unitCost: input.unitCost,
        totalLoss: input.totalLoss,
        salvageValue: input.salvageValue ?? 0,
        reason: input.reason,
        requestedBy: input.requestedBy,
        status: WriteOffStatus.PENDING_APPROVAL,
      },
    });
  }

  async findById(id: string): Promise<WriteOffRequestWithEvidence | null> {
    return this.prisma.writeOffRequest.findUnique({
      where: { id },
      include: { evidence: true },
    });
  }

  async findByWarehouseAndStatus(
    params: WriteOffQueryParams,
  ): Promise<{ data: WriteOffRequest[]; total: number }> {
    const { warehouseId, status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.WriteOffRequestWhereInput = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.writeOffRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { evidence: true },
      }),
      this.prisma.writeOffRequest.count({ where }),
    ]);

    return { data, total };
  }

  async updateStatus(
    id: string,
    status: WriteOffStatus,
    additionalData?: Partial<Pick<WriteOffRequest, 'approvedBy' | 'approvedAt' | 'txId'>>,
  ): Promise<WriteOffRequest> {
    return this.prisma.writeOffRequest.update({
      where: { id },
      data: {
        status,
        ...additionalData,
      },
    });
  }

  async createEvidence(input: CreateWriteOffEvidenceInput): Promise<WriteOffEvidence> {
    return this.prisma.writeOffEvidence.create({
      data: {
        writeOffId: input.writeOffId,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedBy: input.uploadedBy,
      },
    });
  }

  async findEvidenceByWriteOffId(writeOffId: string): Promise<WriteOffEvidence[]> {
    return this.prisma.writeOffEvidence.findMany({
      where: { writeOffId },
    });
  }

  async countEvidenceByWriteOffId(writeOffId: string): Promise<number> {
    return this.prisma.writeOffEvidence.count({
      where: { writeOffId },
    });
  }
}
