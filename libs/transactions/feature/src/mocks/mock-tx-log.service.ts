import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ITxLogService, TxLogEntry, TxStatus } from '@autoflow/shared-types';

/**
 * Mock implementation of ITxLogService.
 * Returns fake TxEntry with generated UUID and auto-incremented tx_number.
 * Used during development until real Master Data module is available.
 */
@Injectable()
export class MockTxLogService implements ITxLogService {
  private txStore: Map<string, TxLogEntry> = new Map();
  private txCounter = 0;

  async createTx(
    dto: Omit<TxLogEntry, 'txId' | 'status' | 'maBefore' | 'maAfter' | 'stockBefore' | 'stockAfter'>,
  ): Promise<TxLogEntry> {
    this.txCounter++;
    const txId = randomUUID();

    const entry: TxLogEntry = {
      ...dto,
      txId,
      status: TxStatus.DRAFT,
      maBefore: 0,
      maAfter: 0,
      stockBefore: 0,
      stockAfter: 0,
    };

    this.txStore.set(txId, entry);
    return entry;
  }

  async postTx(txId: string, postedBy: string): Promise<TxLogEntry> {
    const entry = this.txStore.get(txId);
    if (!entry) {
      throw new Error(`TX not found: ${txId}`);
    }

    const posted: TxLogEntry = {
      ...entry,
      status: TxStatus.POSTED,
      postedBy,
    };

    this.txStore.set(txId, posted);
    return posted;
  }

  async voidTx(txId: string, reason: string, voidedBy: string): Promise<TxLogEntry> {
    const entry = this.txStore.get(txId);
    if (!entry) {
      throw new Error(`TX not found: ${txId}`);
    }

    // Mark original as VOIDED
    const voided: TxLogEntry = { ...entry, status: TxStatus.VOIDED };
    this.txStore.set(txId, voided);

    // Create reverse TX
    const reverseTxId = randomUUID();
    const reverseTx: TxLogEntry = {
      ...entry,
      txId: reverseTxId,
      status: TxStatus.POSTED,
      qty: -entry.qty,
      totalCost: -entry.totalCost,
      apAmount: -entry.apAmount,
      arAmount: -entry.arAmount,
      parentTxId: txId,
      postedBy: voidedBy,
      createdBy: voidedBy,
    };

    this.txStore.set(reverseTxId, reverseTx);
    return reverseTx;
  }

  async findById(txId: string): Promise<TxLogEntry | null> {
    return this.txStore.get(txId) ?? null;
  }

  async findByReference(refField: string, refId: string): Promise<TxLogEntry[]> {
    const results: TxLogEntry[] = [];
    for (const entry of this.txStore.values()) {
      if ((entry as unknown as Record<string, unknown>)[refField] === refId) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Reset the mock store — useful for testing.
   */
  reset(): void {
    this.txStore.clear();
    this.txCounter = 0;
  }
}
