import { Inject, Injectable } from '@nestjs/common';
import { APOpenItem, AROpenItem, ApArStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';
import {
  ApOpenItemRepository,
  ArOpenItemRepository,
} from '@autoflow/transactions-data-access';
import { ITxLogService, TxType } from '@autoflow/shared-types';
import {
  OpenItemNotFoundException,
  PaymentExceedsBalanceException,
} from '../exceptions';
import { AllocationSumMismatchException } from '../exceptions/allocation-sum-mismatch.exception';
import { MakeApPaymentDto, ReceiveArPaymentDto } from '../dto/ap-ar';

export interface PaymentAllocationResult {
  openItemId: string;
  amount: number;
  newStatus: ApArStatus;
}

export interface ApPaymentResult {
  txEntry: { id: string; txType: string; status: string };
  allocations: PaymentAllocationResult[];
}

export interface ArPaymentResult {
  txEntry: { id: string; txType: string; status: string };
  allocations: PaymentAllocationResult[];
}

/**
 * PaymentMatchingService — shared payment matching logic for AP and AR.
 * Validates allocation sum = totalAmount, each allocation ≤ open balance,
 * then updates each open item's remaining balance and status.
 */
@Injectable()
export class PaymentMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apOpenItemRepository: ApOpenItemRepository,
    private readonly arOpenItemRepository: ArOpenItemRepository,
    @Inject('ITxLogService')
    private readonly txLogService: ITxLogService,
  ) {}

  /**
   * Process AP Payment — validate allocations, create TX, update open items.
   * Auth: Manager+ (enforced at controller level)
   */
  async makeApPayment(
    dto: MakeApPaymentDto,
    userId: string,
  ): Promise<ApPaymentResult> {
    // 1. Validate allocation sum = totalAmount
    this.validateAllocationSum(dto.allocations, dto.totalAmount);

    // 2. Validate each allocation against open item balance
    const openItems = await this.validateApAllocations(dto.allocations);

    // 3. Create TX log entry
    const txEntry = await this.txLogService.createTx({
      txType: TxType.AP_PAYMENT,
      txDate: new Date().toISOString(),
      period: new Date().toISOString().slice(0, 7),
      itemId: null,
      warehouseId: null,
      qty: 0,
      unitCost: 0,
      totalCost: dto.totalAmount,
      cogsUnit: null,
      vendorId: dto.vendorId,
      customerId: null,
      apAmount: dto.totalAmount,
      arAmount: 0,
      parentTxId: null,
      createdBy: userId,
      postedBy: null,
    });

    // Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // 4. Update each open item and create allocation records
    const allocations: PaymentAllocationResult[] = [];

    for (let i = 0; i < dto.allocations.length; i++) {
      const allocation = dto.allocations[i];
      const openItem = openItems[i];

      const remaining = Number(openItem.remainingAmount);
      const newRemaining = remaining - allocation.amount;
      const newStatus = this.calculateStatus(
        newRemaining,
        Number(openItem.originalAmount),
      );

      // Update open item
      await this.apOpenItemRepository.updateRemainingAndStatus(
        allocation.openItemId,
        new Prisma.Decimal(newRemaining),
        newStatus,
      );

      // Create allocation record
      await this.prisma.aPPaymentAllocation.create({
        data: {
          paymentTxId: postedTx.txId,
          apOpenItemId: allocation.openItemId,
          amount: new Prisma.Decimal(allocation.amount),
        },
      });

      allocations.push({
        openItemId: allocation.openItemId,
        amount: allocation.amount,
        newStatus,
      });
    }

    return {
      txEntry: {
        id: postedTx.txId,
        txType: TxType.AP_PAYMENT,
        status: 'POSTED',
      },
      allocations,
    };
  }

  /**
   * Process AR Payment — validate allocations, create TX, update open items.
   * Auth: Cashier+ (enforced at controller level)
   */
  async receiveArPayment(
    dto: ReceiveArPaymentDto,
    userId: string,
  ): Promise<ArPaymentResult> {
    // 1. Validate allocation sum = totalAmount
    this.validateAllocationSum(dto.allocations, dto.totalAmount);

    // 2. Validate each allocation against open item balance
    const openItems = await this.validateArAllocations(dto.allocations);

    // 3. Create TX log entry
    const txEntry = await this.txLogService.createTx({
      txType: TxType.AR_RECEIVE,
      txDate: new Date().toISOString(),
      period: new Date().toISOString().slice(0, 7),
      itemId: null,
      warehouseId: null,
      qty: 0,
      unitCost: 0,
      totalCost: dto.totalAmount,
      cogsUnit: null,
      vendorId: null,
      customerId: dto.customerId,
      apAmount: 0,
      arAmount: dto.totalAmount,
      parentTxId: null,
      createdBy: userId,
      postedBy: null,
    });

    // Post the TX
    const postedTx = await this.txLogService.postTx(txEntry.txId, userId);

    // 4. Update each open item and create allocation records
    const allocations: PaymentAllocationResult[] = [];

    for (let i = 0; i < dto.allocations.length; i++) {
      const allocation = dto.allocations[i];
      const openItem = openItems[i];

      const remaining = Number(openItem.remainingAmount);
      const newRemaining = remaining - allocation.amount;
      const newStatus = this.calculateStatus(
        newRemaining,
        Number(openItem.originalAmount),
      );

      // Update open item
      await this.arOpenItemRepository.updateRemainingAndStatus(
        allocation.openItemId,
        new Prisma.Decimal(newRemaining),
        newStatus,
      );

      // Create allocation record
      await this.prisma.aRPaymentAllocation.create({
        data: {
          paymentTxId: postedTx.txId,
          arOpenItemId: allocation.openItemId,
          amount: new Prisma.Decimal(allocation.amount),
        },
      });

      allocations.push({
        openItemId: allocation.openItemId,
        amount: allocation.amount,
        newStatus,
      });
    }

    return {
      txEntry: {
        id: postedTx.txId,
        txType: TxType.AR_RECEIVE,
        status: 'POSTED',
      },
      allocations,
    };
  }

  /**
   * Validate that the sum of all allocation amounts equals the totalAmount.
   * Throws AllocationSumMismatchException if they don't match.
   */
  private validateAllocationSum(
    allocations: { amount: number }[],
    totalAmount: number,
  ): void {
    const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
    // Use rounding to avoid floating point issues (2 decimal places for THB)
    const roundedSum = Math.round(sum * 100) / 100;
    const roundedTotal = Math.round(totalAmount * 100) / 100;

    if (roundedSum !== roundedTotal) {
      throw new AllocationSumMismatchException(roundedSum, roundedTotal);
    }
  }

  /**
   * Validate AP allocations — each open item must exist and have sufficient balance.
   */
  private async validateApAllocations(
    allocations: { openItemId: string; amount: number }[],
  ): Promise<APOpenItem[]> {
    const openItems: APOpenItem[] = [];

    for (const allocation of allocations) {
      const openItem = await this.apOpenItemRepository.findById(
        allocation.openItemId,
      );

      if (!openItem) {
        throw new OpenItemNotFoundException(allocation.openItemId);
      }

      const remaining = Number(openItem.remainingAmount);
      if (allocation.amount > remaining) {
        throw new PaymentExceedsBalanceException(
          allocation.openItemId,
          allocation.amount,
          remaining,
        );
      }

      openItems.push(openItem);
    }

    return openItems;
  }

  /**
   * Validate AR allocations — each open item must exist and have sufficient balance.
   */
  private async validateArAllocations(
    allocations: { openItemId: string; amount: number }[],
  ): Promise<AROpenItem[]> {
    const openItems: AROpenItem[] = [];

    for (const allocation of allocations) {
      const openItem = await this.arOpenItemRepository.findById(
        allocation.openItemId,
      );

      if (!openItem) {
        throw new OpenItemNotFoundException(allocation.openItemId);
      }

      const remaining = Number(openItem.remainingAmount);
      if (allocation.amount > remaining) {
        throw new PaymentExceedsBalanceException(
          allocation.openItemId,
          allocation.amount,
          remaining,
        );
      }

      openItems.push(openItem);
    }

    return openItems;
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
