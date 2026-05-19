import { MockTxLogService } from './mock-tx-log.service';
import { TxType, TxStatus } from '@autoflow/shared-types';

describe('MockTxLogService', () => {
  let service: MockTxLogService;

  beforeEach(() => {
    service = new MockTxLogService();
  });

  describe('createTx', () => {
    it('should create a TX entry with generated UUID and DRAFT status', async () => {
      const result = await service.createTx({
        txType: TxType.ADJ_COUNT_UP,
        txDate: '2025-01-15T10:00:00Z',
        period: '2025-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: 10,
        unitCost: 100,
        totalCost: 1000,
        cogsUnit: null,
        vendorId: null,
        customerId: null,
        apAmount: 0,
        arAmount: 0,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      expect(result.txId).toBeDefined();
      expect(result.txId).toHaveLength(36); // UUID v4 format
      expect(result.status).toBe(TxStatus.DRAFT);
      expect(result.txType).toBe(TxType.ADJ_COUNT_UP);
      expect(result.qty).toBe(10);
    });

    it('should store TX entries in memory', async () => {
      await service.createTx({
        txType: TxType.ADJ_TRANSFER,
        txDate: '2025-01-15T10:00:00Z',
        period: '2025-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: 5,
        unitCost: 50,
        totalCost: 250,
        cogsUnit: null,
        vendorId: null,
        customerId: null,
        apAmount: 0,
        arAmount: 0,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      const all = service.getAll();
      expect(all).toHaveLength(1);
    });
  });

  describe('postTx', () => {
    it('should post a DRAFT TX', async () => {
      const created = await service.createTx({
        txType: TxType.ADJ_COUNT_UP,
        txDate: '2025-01-15T10:00:00Z',
        period: '2025-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: 10,
        unitCost: 100,
        totalCost: 1000,
        cogsUnit: null,
        vendorId: null,
        customerId: null,
        apAmount: 0,
        arAmount: 0,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      const posted = await service.postTx(created.txId, 'user-1');
      expect(posted.status).toBe(TxStatus.POSTED);
      expect(posted.postedBy).toBe('user-1');
    });

    it('should throw if TX not found', async () => {
      await expect(service.postTx('non-existent', 'user-1')).rejects.toThrow('TX not found');
    });
  });

  describe('findById', () => {
    it('should find TX by ID', async () => {
      const created = await service.createTx({
        txType: TxType.ADJ_WRITEOFF,
        txDate: '2025-01-15T10:00:00Z',
        period: '2025-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: -3,
        unitCost: 200,
        totalCost: -600,
        cogsUnit: null,
        vendorId: null,
        customerId: null,
        apAmount: 0,
        arAmount: 0,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      const found = await service.findById(created.txId);
      expect(found).not.toBeNull();
      expect(found!.txId).toBe(created.txId);
    });

    it('should return null for non-existent TX', async () => {
      const found = await service.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all TX entries', async () => {
      await service.createTx({
        txType: TxType.ADJ_COUNT_UP,
        txDate: '2025-01-15T10:00:00Z',
        period: '2025-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: 10,
        unitCost: 100,
        totalCost: 1000,
        cogsUnit: null,
        vendorId: null,
        customerId: null,
        apAmount: 0,
        arAmount: 0,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      service.clear();
      expect(service.getAll()).toHaveLength(0);
    });
  });
});
