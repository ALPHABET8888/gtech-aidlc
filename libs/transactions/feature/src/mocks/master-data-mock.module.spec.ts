import { Test, TestingModule } from '@nestjs/testing';
import { MasterDataMockModule } from './master-data-mock.module';
import { MockTxLogService } from './mock-tx-log.service';
import { MockMaCalculationService } from './mock-ma-calculation.service';
import { MockStockValidationService } from './mock-stock-validation.service';
import { MockPeriodService } from './mock-period.service';
import { MockRefChainService } from './mock-ref-chain.service';
import { MockMasterDataLookupService } from './mock-master-data-lookup.service';
import {
  ITxLogService,
  IMaCalculationService,
  IStockValidationService,
  IPeriodService,
  IRefChainService,
  IMasterDataLookupService,
  TxType,
  TxStatus,
} from '@autoflow/shared-types';

describe('MasterDataMockModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [MasterDataMockModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should provide all 6 DI tokens', () => {
    expect(module.get('ITxLogService')).toBeDefined();
    expect(module.get('IMaCalculationService')).toBeDefined();
    expect(module.get('IStockValidationService')).toBeDefined();
    expect(module.get('IPeriodService')).toBeDefined();
    expect(module.get('IRefChainService')).toBeDefined();
    expect(module.get('IMasterDataLookupService')).toBeDefined();
  });

  describe('MockTxLogService', () => {
    let service: MockTxLogService;

    beforeEach(() => {
      service = module.get<MockTxLogService>('ITxLogService');
      service.reset();
    });

    it('should create a TX with UUID', async () => {
      const tx = await service.createTx({
        txType: TxType.GR_RECEIVE,
        txDate: '2024-01-15T00:00:00Z',
        period: '2024-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: 10,
        unitCost: 100,
        totalCost: 1000,
        cogsUnit: null,
        vendorId: 'vendor-1',
        customerId: null,
        apAmount: 1000,
        arAmount: 0,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      expect(tx.txId).toBeDefined();
      expect(tx.txId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(tx.status).toBe(TxStatus.DRAFT);
      expect(tx.txType).toBe(TxType.GR_RECEIVE);
    });

    it('should post a TX', async () => {
      const tx = await service.createTx({
        txType: TxType.SALE_INVOICE,
        txDate: '2024-01-15T00:00:00Z',
        period: '2024-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: -5,
        unitCost: 100,
        totalCost: -500,
        cogsUnit: 100,
        vendorId: null,
        customerId: 'cust-1',
        apAmount: 0,
        arAmount: 500,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      const posted = await service.postTx(tx.txId, 'manager-1');
      expect(posted.status).toBe(TxStatus.POSTED);
      expect(posted.postedBy).toBe('manager-1');
    });

    it('should find TX by ID', async () => {
      const tx = await service.createTx({
        txType: TxType.GR_RECEIVE,
        txDate: '2024-01-15T00:00:00Z',
        period: '2024-01',
        itemId: 'item-1',
        warehouseId: 'wh-1',
        qty: 10,
        unitCost: 100,
        totalCost: 1000,
        cogsUnit: null,
        vendorId: 'vendor-1',
        customerId: null,
        apAmount: 1000,
        arAmount: 0,
        parentTxId: null,
        createdBy: 'user-1',
        postedBy: null,
      });

      const found = await service.findById(tx.txId);
      expect(found).toBeDefined();
      expect(found?.txId).toBe(tx.txId);
    });
  });

  describe('MockMaCalculationService', () => {
    let service: MockMaCalculationService;

    beforeEach(() => {
      service = module.get<MockMaCalculationService>('IMaCalculationService');
      service.reset();
    });

    it('should calculate MA for stock-in', () => {
      // 5 units at 80 THB + 10 units at 100 THB = 15 units at 93.33 THB
      const result = service.calculateMa({
        currentQty: 5,
        currentMa: 80,
        qtyChange: 10,
        unitCost: 100,
      });

      expect(result.maBefore).toBe(80);
      expect(result.maAfter).toBeCloseTo(93.33, 1);
      expect(result.stockBefore).toBe(5);
      expect(result.stockAfter).toBe(15);
    });

    it('should not change MA on stock-out', () => {
      const result = service.calculateStockOut(100, 80, 10);

      expect(result.maBefore).toBe(80);
      expect(result.maAfter).toBe(80);
      expect(result.stockBefore).toBe(100);
      expect(result.stockAfter).toBe(90);
    });

    it('should return configurable MA', async () => {
      service.setMa('item-1', 'wh-1', 150);
      const ma = await service.getCurrentMa('item-1', 'wh-1');
      expect(ma).toBe(150);
    });

    it('should return default MA when not configured', async () => {
      const ma = await service.getCurrentMa('unknown-item', 'unknown-wh');
      expect(ma).toBe(100);
    });
  });

  describe('MockStockValidationService', () => {
    let service: MockStockValidationService;

    beforeEach(() => {
      service = module.get<MockStockValidationService>('IStockValidationService');
      service.reset();
    });

    it('should pass validation by default', async () => {
      const result = await service.validateStockAvailability('item-1', 'wh-1', 10);
      expect(result.valid).toBe(true);
      expect(result.availableQty).toBe(1000);
    });

    it('should throw when item is configured to fail', async () => {
      service.setFailing('item-1', 'wh-1');
      await expect(
        service.validateStockAvailability('item-1', 'wh-1', 10),
      ).rejects.toThrow();
    });

    it('should throw when requested qty exceeds balance', async () => {
      service.setStockBalance('item-1', 'wh-1', 5);
      await expect(
        service.validateStockAvailability('item-1', 'wh-1', 10),
      ).rejects.toThrow();
    });
  });

  describe('MockPeriodService', () => {
    let service: MockPeriodService;

    beforeEach(() => {
      service = module.get<MockPeriodService>('IPeriodService');
      service.reset();
    });

    it('should pass validation by default', async () => {
      const result = await service.validatePeriodOpen('2024-01');
      expect(result).toBe(true);
    });

    it('should throw when period is closed', async () => {
      service.closePeriodMock('2024-01');
      await expect(service.validatePeriodOpen('2024-01')).rejects.toThrow();
    });

    it('should return current period in YYYY-MM format', () => {
      const period = service.getCurrentPeriod();
      expect(period).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('MockRefChainService', () => {
    let service: MockRefChainService;

    beforeEach(() => {
      service = module.get<MockRefChainService>('IRefChainService');
      service.reset();
    });

    it('should pass validation by default', async () => {
      await expect(
        service.validateRefChain(TxType.CN_RETURN, { refGrId: 'gr-1' }),
      ).resolves.toBeUndefined();
    });

    it('should throw when TX type is configured to fail', async () => {
      service.setFailing(TxType.CN_RETURN, 'GR_RETURN reference required');
      await expect(
        service.validateRefChain(TxType.CN_RETURN, {}),
      ).rejects.toThrow();
    });
  });

  describe('MockMasterDataLookupService', () => {
    let service: MockMasterDataLookupService;

    beforeEach(() => {
      service = module.get<MockMasterDataLookupService>('IMasterDataLookupService');
      service.reset();
    });

    it('should return items from fixtures', async () => {
      const items = await service.listItems();
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].code).toBe('ITM-001');
    });

    it('should return item by ID', async () => {
      const item = await service.getItem('a1b2c3d4-1111-4000-8000-000000000001');
      expect(item.name).toBe('น้ำมันเครื่อง 5W-30');
    });

    it('should throw NotFoundException for unknown item', async () => {
      await expect(service.getItem('unknown-id')).rejects.toThrow('Item not found');
    });

    it('should return vendors from fixtures', async () => {
      const vendors = await service.listVendors();
      expect(vendors.length).toBe(3);
    });

    it('should return customers from fixtures', async () => {
      const customers = await service.listCustomers();
      expect(customers.length).toBe(3);
    });

    it('should return warehouses from fixtures', async () => {
      const warehouses = await service.listWarehouses();
      expect(warehouses.length).toBe(3);
    });
  });
});
