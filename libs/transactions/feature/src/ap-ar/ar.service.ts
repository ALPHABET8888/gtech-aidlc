import { Injectable } from '@nestjs/common';
import { AROpenItem, ApArStatus, Prisma } from '@prisma/client';
import {
  ArOpenItemRepository,
  FindArOpenItemsOptions,
} from '@autoflow/transactions-data-access';
import {
  OpenItemNotFoundException,
  PaymentExceedsBalanceException,
} from '../exceptions';
import { PaginatedResponseDto } from '../dto/shared/paginated-response.dto';

export interface CreateArOpenItemInput {
  customerId: string;
  txId: string;
  txType: string;
  originalAmount: number;
  vatAmount: number;
  taxInvoiceNo?: string;
  dueDate?: Date;
  period: string;
}

@Injectable()
export class ArService {
  constructor(
    private readonly arOpenItemRepository: ArOpenItemRepository,
  ) {}

  /**
   * Create a new AR Open Item (typically from SALE_INVOICE or TEMP_DO).
   * Initial status is OPEN with remainingAmount = originalAmount.
   */
  async createArOpenItem(input: CreateArOpenItemInput): Promise<AROpenItem> {
    const data: Prisma.AROpenItemCreateInput = {
      customerId: input.customerId,
      txId: input.txId,
      txType: input.txType,
      originalAmount: new Prisma.Decimal(input.originalAmount),
      remainingAmount: new Prisma.Decimal(input.originalAmount),
      vatAmount: new Prisma.Decimal(input.vatAmount),
      status: ApArStatus.OPEN,
      taxInvoiceNo: input.taxInvoiceNo ?? null,
      dueDate: input.dueDate ?? null,
      period: input.period,
    };

    return this.arOpenItemRepository.create(data);
  }

  /**
   * Find AR Open Item by the TX ID that created it.
   */
  async findByTxId(txId: string): Promise<AROpenItem | null> {
    return this.arOpenItemRepository.findByTxId(txId);
  }

  /**
   * Reduce AR open item balance by Credit Note amount.
   * Automatically transitions status based on remaining balance:
   * - remainingAmount = 0 → CLOSED
   * - 0 < remainingAmount < originalAmount → PARTIAL
   * - remainingAmount = originalAmount → OPEN
   */
  async reduceArByCn(openItemId: string, amount: number): Promise<AROpenItem> {
    const openItem = await this.arOpenItemRepository.findById(openItemId);

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

    return this.arOpenItemRepository.updateRemainingAndStatus(
      openItemId,
      new Prisma.Decimal(newRemaining),
      newStatus,
    );
  }

  /**
   * Get open AR items with pagination and optional filters.
   */
  async getOpenArItems(
    options: FindArOpenItemsOptions = {},
  ): Promise<PaginatedResponseDto<AROpenItem>> {
    const { page = 1, limit = 20 } = options;
    const { data, total } = await this.arOpenItemRepository.findMany(options);

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
