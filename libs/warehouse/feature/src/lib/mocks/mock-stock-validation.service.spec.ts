import {
  MockStockValidationService,
  StockNegativeException,
  StockFrozenException,
} from './mock-stock-validation.service';

describe('MockStockValidationService', () => {
  let service: MockStockValidationService;

  beforeEach(() => {
    service = new MockStockValidationService();
    service.loadStock([
      { itemId: 'item-1', warehouseId: 'wh-1', qty: 100 },
      { itemId: 'item-2', warehouseId: 'wh-1', qty: 50 },
      { itemId: 'item-1', warehouseId: 'wh-2', qty: 30 },
    ]);
  });

  describe('validateStockAvailability', () => {
    it('should pass when stock is sufficient', async () => {
      const result = await service.validateStockAvailability('item-1', 'wh-1', 50);
      expect(result.valid).toBe(true);
      expect(result.availableQty).toBe(100);
    });

    it('should throw StockNegativeException when stock is insufficient', async () => {
      await expect(
        service.validateStockAvailability('item-1', 'wh-1', 150),
      ).rejects.toThrow(StockNegativeException);
    });

    it('should return 0 for unknown item+warehouse', async () => {
      await expect(
        service.validateStockAvailability('unknown', 'wh-1', 1),
      ).rejects.toThrow(StockNegativeException);
    });
  });

  describe('getStockBalance', () => {
    it('should return stock balance for known item', async () => {
      const balance = await service.getStockBalance('item-1', 'wh-1');
      expect(balance).toBe(100);
    });

    it('should return 0 for unknown item', async () => {
      const balance = await service.getStockBalance('unknown', 'wh-1');
      expect(balance).toBe(0);
    });
  });

  describe('validateNotFrozen', () => {
    it('should pass when item is not frozen', async () => {
      await expect(
        service.validateNotFrozen('item-1', 'wh-1'),
      ).resolves.toBeUndefined();
    });

    it('should throw StockFrozenException when item is frozen', async () => {
      service.freezeItem('item-1', 'wh-1');
      await expect(
        service.validateNotFrozen('item-1', 'wh-1'),
      ).rejects.toThrow(StockFrozenException);
    });

    it('should not affect other items when one is frozen', async () => {
      service.freezeItem('item-1', 'wh-1');
      await expect(
        service.validateNotFrozen('item-2', 'wh-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('isStockFrozen', () => {
    it('should return false when no items frozen in warehouse', async () => {
      const frozen = await service.isStockFrozen('wh-1');
      expect(frozen).toBe(false);
    });

    it('should return true when any item is frozen in warehouse', async () => {
      service.freezeItem('item-1', 'wh-1');
      const frozen = await service.isStockFrozen('wh-1');
      expect(frozen).toBe(true);
    });
  });

  describe('freezeItem / unfreezeItem', () => {
    it('should freeze and unfreeze items', async () => {
      service.freezeItem('item-1', 'wh-1');
      await expect(service.validateNotFrozen('item-1', 'wh-1')).rejects.toThrow();

      service.unfreezeItem('item-1', 'wh-1');
      await expect(service.validateNotFrozen('item-1', 'wh-1')).resolves.toBeUndefined();
    });
  });

  describe('setStock / adjustStock', () => {
    it('should set stock to a specific value', async () => {
      service.setStock('item-1', 'wh-1', 200);
      const balance = await service.getStockBalance('item-1', 'wh-1');
      expect(balance).toBe(200);
    });

    it('should adjust stock by delta', async () => {
      service.adjustStock('item-1', 'wh-1', -20);
      const balance = await service.getStockBalance('item-1', 'wh-1');
      expect(balance).toBe(80);
    });
  });
});
