import { Injectable } from '@nestjs/common';
import { APOpenItem, ApArStatus, Prisma } from '@prisma/client';
import {
  ApOpenItemRepository,
  FindApOpenItemsOptions,
} from '@autoflow/transactions-data-access';
import {
  OpenItemNotFoundException,
  PaymentExceedsBalanceException,
} from '../exceptions';
import { PaginatedResponseDto } from '../dto/shared/paginated-response.dto';

export interface CreateApOpenItemInput {
  vendorId: string;
  txId: string;
  txType: string;
  originalAmount: number;
  vatAmount: number;
  taxInvoiceNo: string;
  dueDate?: Date;
  period: string;
}

@Injectable()
export class ApService {
  constructor(
    private readonly apOpenItemRepository: ApOpenItemRepository,
  ) {}

  /**
   * Create a new AP Open Item (typically from GR_RECEIVE).
   * Initial status is OPEN with remainingAmount = originalAmount.
   */
  async createApOpenItem(input: CreateApOpenItemInput): Promise<APOpenItem> {
    const data: Prisma.APOpenItemCreateInput = {
      vendorId: input.vendorId,
      txId: input.txId,
      txType: input.txType,
      originalAmount: new Prisma.Decimal(input.originalAmount),
      remainingAmount: new Prisma.Decimal(input.originalAmount),
      vatAmount: new Prisma.Decimal(input.vatAmount),
      status: ApArStatus.OPEN,
      taxInvoiceNo: input.taxInvoiceNo,
      dueDate: input.dueDate ?? null,
      period: input.period,
    };

    return this.apOpenItemRepository.create(data);
  }

  /**
   * Find AP Open Item by the TX ID that created it.
   */
  async findByTxId(txId: string): Promise<APOpenItem | null> {
    return this.apOpenItemRepository.findByTxId(txId);
  }

  /**
   * Reduce AP open item balance by Credit Note amount.
   * Automatically transitions status based on remaining balance:
   * - remainingAmount = 0 → CLOSED
   * - 0 < remainingAmount < originalAmount → PARTIAL
   * - remainingAmount = originalAmount → OPEN
   */
  async reduceApByCn(openItemId: string, amount: number): Promise<APOpenItem> {
    const openItem = await this.apOpenItemRepository.findById(openItemId);

    if (!openItem) {
      throw new OpenItemNotFoundException(openItemId);
    }

    const remaining = Number(openItem.remainingAmount);

    if (amount > remaining) {
      throw new PaymentExceedsBalanceException(openItemId, amount, remaining);
    }

    const newRemaining = remaining - amount;
    const newStatus = this.calculateStatus(
      newRemaining,
      Number(openItem.originalAmount),
    );

    return this.apOpenItemRepository.updateRemainingAndStatus(
      openItemId,
      new Prisma.Decimal(newRemaining),
      newStatus,
    );
  }

  /**
   * Get open AP items with pagination and optional filters.
   */
  async getOpenApItems(
    options: FindApOpenItemsOptions = {},
  ): Promise<PaginatedResponseDto<APOpenItem>> {
    const { page = 1, limit = 20 } = options;
    const { data, total } = await this.apOpenItemRepository.findMany(options);

    return PaginatedResponseDto.create(data, total, page, limit);
  }

  /**
   * Calculate status based on remaining vs original amount.
   */
  private calculateStatus(
    remainingAmount: number,
    originalAmount: number,
  ): ApArStatus {
    if (remainingAmount <= 0) {
      return ApArStatus.CLOSED;
    }
    if (remainingAmount < originalAmount) {
      return ApArStatus.PARTIAL;
    }
    return ApArStatus.OPEN;
  }
}
