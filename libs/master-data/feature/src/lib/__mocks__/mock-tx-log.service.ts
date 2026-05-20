import { TxType, TxStatus } from '@autoflow/shared-types';
import type { ITxLogService, TxLogEntry } from '@autoflow/shared-types';

/**
 * Mock TX Log Service for downstream unit testing.
 * Returns realistic sample data matching seed data values.
 */
export class MockTxLogService implements ITxLogService {
  private readonly sampleEntries: TxLogEntry[] = [
    {
      txId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      txType: TxType.GR_RECEIVE,
      txDate: '2024-01-15T10:30:00.000Z',
      period: '2024-01',
      status: TxStatus.POSTED,
      itemId: 'item-001-sku-a100',
      warehouseId: 'wh-001-main',
      qty: 100,
      unitCost: 85.5,
      totalCost: 8550.0,
      maBefore: 80.0,
      maAfter: 82.75,
      stockBefore: 50,
      stockAfter: 150,
      cogsUnit: null,
      vendorId: 'vendor-001-abc',
      customerId: null,
      apAmount: 8550.0,
      arAmount: 0,
      parentTxId: null,
      createdBy: 'user-store-001',
      postedBy: 'user-store-001',
    },
    {
      txId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      txType: TxType.SALE_INVOICE,
      txDate: '2024-01-16T14:00:00.000Z',
      period: '2024-01',
      status: TxStatus.POSTED,
      itemId: 'item-002-sku-b200',
      warehouseId: 'wh-001-main',
      qty: 10,
      unitCost: 82.75,
      totalCost: 827.5,
      maBefore: 82.75,
      maAfter: 82.75,
      stockBefore: 150,
      stockAfter: 140,
      cogsUnit: 82.75,
      vendorId: null,
      customerId: 'cust-001-xyz',
      apAmount: 0,
      arAmount: 1200.0,
      parentTxId: null,
      createdBy: 'user-cashier-001',
      postedBy: 'user-cashier-001',
    },
    {
      txId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      txType: TxType.ADJ_COUNT_UP,
      txDate: '2024-02-01T09:00:00.000Z',
      period: '2024-02',
      status: TxStatus.POSTED,
      itemId: 'item-003-sku-c300',
      warehouseId: 'wh-002-branch',
      qty: 5,
      unitCost: 120.0,
      totalCost: 600.0,
      maBefore: 115.0,
      maAfter: 116.43,
      stockBefore: 30,
      stockAfter: 35,
      cogsUnit: null,
      vendorId: null,
      customerId: null,
      apAmount: 0,
      arAmount: 0,
      parentTxId: null,
      createdBy: 'user-supervisor-001',
      postedBy: 'user-supervisor-001',
    },
  ];

  async createTx(
    dto: unknown,
    userId: string,
  ): Promise<TxLogEntry> {
    const entry: TxLogEntry = {
      ...this.sampleEntries[0],
      txId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdBy: userId,
      postedBy: userId,
      txDate: new Date().toISOString(),
    };
    return entry;
  }

  async findById(txId: string): Promise<TxLogEntry | null> {
    return (
      this.sampleEntries.find((e) => e.txId === txId) ??
      this.sampleEntries[0]
    );
  }

  async findMany(
    _filters?: unknown,
    _pagination?: unknown,
  ): Promise<TxLogEntry[]> {
    return [...this.sampleEntries];
  }

  async updateStatus(
    txId: string,
    status: string,
  ): Promise<TxLogEntry> {
    const entry = this.sampleEntries[0];
    return { ...entry, txId, status: status as TxStatus };
  }
}
