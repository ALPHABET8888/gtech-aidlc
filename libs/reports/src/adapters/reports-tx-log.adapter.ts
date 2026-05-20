import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoflow/shared-prisma';
import { TxType, TxStatus } from '@prisma/client';
import { ITxLogService } from '@autoflow/shared-types';

/**
 * Reports-specific TX Log adapter.
 * Provides the ITxLogService interface plus reports-specific lookup methods
 * (hasInvoiceForJo, hasTempDoForJo, getStockBalance) using real Prisma queries.
 */
@Injectable()
export class ReportsTxLogAdapter implements ITxLogService {
  constructor(private readonly prisma: PrismaService) {}

  async createTx(dto: any, userId?: string): Promise<any> {
    // Reports module doesn't create TXs — delegate to real service if needed
    throw new Error('Reports module does not create transactions');
  }

  async postTx(txId: string, userId: string): Promise<any> {
    throw new Error('Reports module does not post transactions');
  }

  async findById(txId: string): Promise<any | null> {
    return this.prisma.txLog.findUnique({ where: { id: txId } });
  }

  /**
   * Check if a Job Order already has an invoice (SALE_INVOICE or INVOICE_FROM_DO).
   * Used by DUPLICATE_INVOICE alert rule.
   */
  async hasInvoiceForJo(refJoId: string): Promise<boolean> {
    const count = await this.prisma.txLog.count({
      where: {
        refJoId,
        txType: { in: [TxType.SALE_INVOICE, TxType.INVOICE_FROM_DO] },
        txStatus: { not: TxStatus.VOIDED },
      },
    });
    return count > 0;
  }

  /**
   * Check if a Job Order has a TEMP_DO.
   * Used by DUPLICATE_INVOICE alert rule (SALE_INVOICE blocked if has_temp_do).
   */
  async hasTempDoForJo(refJoId: string): Promise<boolean> {
    const count = await this.prisma.txLog.count({
      where: {
        refJoId,
        txType: TxType.TEMP_DO,
        txStatus: { not: TxStatus.VOIDED },
      },
    });
    return count > 0;
  }

  /**
   * Get stock balance for an item in a warehouse.
   * Used by STOCK_NEGATIVE alert rule.
   */
  async getStockBalance(itemId: string, warehouseId: string): Promise<{ qty: number; ma: number }> {
    const balance = await this.prisma.stockBalance.findUnique({
      where: {
        idx_stock_balance_item_wh: { itemId, warehouseId },
      },
    });
    return balance
      ? { qty: Number(balance.qty), ma: Number(balance.ma) }
      : { qty: 0, ma: 0 };
  }
}
