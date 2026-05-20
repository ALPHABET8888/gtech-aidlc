import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { JobOrderRepository, FindJobOrdersOptions } from '@autoflow/transactions-data-access';
import { CreateJobOrderDto, UpdateJoStatusDto, JOStatus, PaginatedResponseDto } from '../dto';
import { JobOrder, JOStatus as PrismaJOStatus, Prisma } from '@prisma/client';

/**
 * Valid state transitions for Job Order state machine.
 * OPEN → IN_PROGRESS → DONE (no skip, no reverse)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  [JOStatus.OPEN]: [JOStatus.IN_PROGRESS],
  [JOStatus.IN_PROGRESS]: [JOStatus.DONE],
  [JOStatus.DONE]: [],
};

@Injectable()
export class JobOrderService {
  constructor(private readonly jobOrderRepository: JobOrderRepository) {}

  /**
   * Create a new Job Order with auto-generated JO number.
   * Calculates totalAmount, vatAmount (7%), and grandTotal from items.
   */
  async createJobOrder(dto: CreateJobOrderDto, createdBy: string): Promise<JobOrder> {
    const joNumber = this.generateJoNumber();

    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.qty * item.unitPrice,
      0,
    );
    const vatAmount = totalAmount * 0.07;
    const grandTotal = totalAmount + vatAmount;

    return this.jobOrderRepository.create({
      joNumber,
      customerId: dto.customerId,
      status: PrismaJOStatus.OPEN,
      hasTempDo: false,
      items: dto.items as unknown as Prisma.InputJsonValue,
      totalAmount: totalAmount.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
      notes: dto.notes ?? null,
      createdBy,
    });
  }

  /**
   * Update Job Order status with state machine validation.
   * Only allows: OPEN → IN_PROGRESS → DONE
   */
  async updateStatus(id: string, dto: UpdateJoStatusDto): Promise<JobOrder> {
    const jobOrder = await this.findByIdOrThrow(id);
    const currentStatus = jobOrder.status;
    const targetStatus = dto.status;

    const allowedTransitions = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTransitions.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${currentStatus} → ${targetStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      );
    }

    return this.jobOrderRepository.updateStatus(id, targetStatus as unknown as PrismaJOStatus);
  }

  /**
   * Get a single Job Order by ID.
   */
  async findById(id: string): Promise<JobOrder> {
    return this.findByIdOrThrow(id);
  }

  /**
   * List Job Orders with offset-based pagination.
   */
  async findMany(options: FindJobOrdersOptions): Promise<PaginatedResponseDto<JobOrder>> {
    const { page = 1, limit = 20 } = options;
    const { data, total } = await this.jobOrderRepository.findMany(options);
    return PaginatedResponseDto.create(data, total, page, limit);
  }

  /**
   * Find a Job Order by ID or throw NotFoundException.
   */
  private async findByIdOrThrow(id: string): Promise<JobOrder> {
    const jobOrder = await this.jobOrderRepository.findById(id);
    if (!jobOrder) {
      throw new NotFoundException(`Job Order with ID ${id} not found`);
    }
    return jobOrder;
  }

  /**
   * Generate a sequential JO number in format: JO-YYYYMM-NNNN
   */
  private generateJoNumber(): string {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `JO-${yearMonth}-`;
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}${timestamp.padStart(4, '0')}`;
  }
}
