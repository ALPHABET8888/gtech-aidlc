import { Injectable } from '@nestjs/common';
import { GrIrClearingRepository } from '@autoflow/transactions-data-access';
import { GrIrClearing, ClearingStatus, Prisma } from '@prisma/client';
import { ClearingNotOpenException } from '../exceptions';

/**
 * GrIrClearingService — manages GR/IR Clearing lifecycle.
 * Clearing is opened on GR_RETURN and closed by either GR_REPLACEMENT or CN_RETURN.
 */
@Injectable()
export class GrIrClearingService {
  constructor(
    private readonly clearingRepo: GrIrClearingRepository,
  ) {}

  /**
   * Open a new clearing entry when goods are returned to supplier.
   * Clearing amount = qty * MA at time of return.
   */
  async openClearing(params: {
    grReturnTxId: string;
    grReceiveTxId: string;
    vendorId: string;
    itemId: string;
    qty: number;
    clearingAmount: number;
  }): Promise<GrIrClearing> {
    return this.clearingRepo.create({
      grReturnTxId: params.grReturnTxId,
      grReceiveTxId: params.grReceiveTxId,
      vendorId: params.vendorId,
      itemId: params.itemId,
      qty: new Prisma.Decimal(params.qty),
      clearingAmount: new Prisma.Decimal(params.clearingAmount),
      status: 'OPEN',
    });
  }

  /**
   * Close clearing by receiving replacement goods.
   * PPV = 0 (replacement is same goods, no price variance).
   */
  async closeByReplacement(clearingId: string, replacementTxId: string): Promise<GrIrClearing> {
    const clearing = await this.clearingRepo.findById(clearingId);
    if (!clearing || clearing.status !== 'OPEN') {
      throw new ClearingNotOpenException(clearingId);
    }

    return this.clearingRepo.close(
      clearingId,
      replacementTxId,
      'GR_REPLACEMENT',
      new Prisma.Decimal(0),
    );
  }

  /**
   * Close clearing by CN_RETURN.
   * PPV = clearingAmount - cnAmount (difference between GR cost and CN amount).
   */
  async closeByCnReturn(
    clearingId: string,
    cnTxId: string,
    cnAmount: number,
  ): Promise<GrIrClearing> {
    const clearing = await this.clearingRepo.findById(clearingId);
    if (!clearing || clearing.status !== 'OPEN') {
      throw new ClearingNotOpenException(clearingId);
    }

    const ppv = Number(clearing.clearingAmount) - cnAmount;

    return this.clearingRepo.close(
      clearingId,
      cnTxId,
      'CN_RETURN',
      new Prisma.Decimal(ppv),
    );
  }

  /**
   * Find a clearing by ID.
   */
  async findById(clearingId: string): Promise<GrIrClearing | null> {
    return this.clearingRepo.findById(clearingId);
  }

  /**
   * Find clearing by GR Return TX ID.
   */
  async findByGrReturnTxId(grReturnTxId: string): Promise<GrIrClearing | null> {
    return this.clearingRepo.findByGrReturnTxId(grReturnTxId);
  }
}
