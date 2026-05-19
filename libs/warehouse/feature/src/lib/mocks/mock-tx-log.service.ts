import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ITxLogService,
  TxLogEntry,
  TxStatus,
} from '@autoflow/shared-types';

/**
 * Mock implementation of ITxLogService.
 * Stores TX entries in-memory for development and testing.
 */
@Injectable()
export class MockTxLogService implements ITxLogService {
  private readonly txLog: TxLogEntry[] = [];

  async createTx(
    dto: Omit<TxLogEntry, 'txId' | 'status' | 'maBefore' | 'maAfter' | 'stockBefore' | 'stockAfter'>,
  ): Promise<TxLogEntry> {
    const entry: TxLogEntry = {
      txId: randomUUID(),
      ...dto,
      status: TxStatus.DRAFT,
      maBefore: 0,
      maAfter: 0,
      stockBefore: 0,
      stockAfter: 0,
    };
    this.txLog.push(entry);
    return entry;
  }

  async postTx(txId: string, postedBy: string): Promise<TxLogEntry> {
    const entry = this.txLog.find((tx) => tx.txId === txId);
    if (!entry) {
      throw new Error(`TX not found: ${txId}`);
    }
    if (entry.status !== TxStatus.DRAFT) {
      throw new Error(`TX ${txId} is not in DRAFT status`);
    }
    entry.status = TxStatus.POSTED;
    entry.postedBy = postedBy;
    return entry;
  }

  async voidTx(txId: string, reason: string, voidedBy: string): Promise<TxLogEntry> {
    const original = this.txLog.find((tx) => tx.txId === txId);
    if (!original) {
      throw new Error(`TX not found: ${txId}`);
    }
    if (original.status !== TxStatus.POSTED) {
      throw new Error(`TX ${txId} is not in POSTED status`);
    }

    // Mark original as VOIDED
    original.status = TxStatus.VOIDED;

    // Create reverse TX
    const reverseTx: TxLogEntry = {
      txId: randomUUID(),
      txType: original.txType,
      txDate: new Date().toISOString(),
      period: original.period,
      status: TxStatus.POSTED,
      itemId: original.itemId,
      warehouseId: original.warehouseId,
      qty: -original.qty,
      unitCost: original.unitCost,
      totalCost: -original.totalCost,
      maBefore: original.maAfter,
      maAfter: original.maBefore,
      stockBefore: original.stockAfter,
      stockAfter: original.stockBefore,
      cogsUnit: original.cogsUnit,
      vendorId: original.vendorId,
      customerId: original.customerId,
      apAmount: -original.apAmount,
      arAmount: -original.arAmount,
      parentTxId: txId,
      createdBy: voidedBy,
      postedBy: voidedBy,
    };
    this.txLog.push(reverseTx);
    return reverseTx;
  }

  async findById(txId: string): Promise<TxLogEntry | null> {
    return this.txLog.find((tx) => tx.txId === txId) ?? null;
  }

  async findByReference(_refField: string, _refId: string): Promise<TxLogEntry[]> {
    // Simplified mock — returns empty array
    return [];
  }

  /**
   * Get all TX entries (for testing/debugging).
   */
  getAll(): TxLogEntry[] {
    return [...this.txLog];
  }

  /**
   * Clear all TX entries (for testing).
   */
  clear(): void {
    this.txLog.length = 0;
  }
}
