import { MockMaService } from './mock-ma.service';

describe('MockMaService', () => {
  let service: MockMaService;

  beforeEach(() => {
    service = new MockMaService();
    service.loadBalances([
      { itemId: 'item-1', warehouseId: 'wh-1', qty: 100, ma: 50 },
      { itemId: 'item-2', warehouseId: 'wh-1', qty: 200, ma: 30 },
    ]);
  });

  describe('calculateMa', () => {
    it('should calculate new MA on stock-in', () => {
      // 100 units at MA 50 = 5000 value
      // + 50 units at cost 80 = 4000 value
      // Total: 150 units, 9000 value → MA = 60
      const result = service.calculateMa({
        currentQty: 100,
        currentMa: 50,
        qtyChange: 50,
        unitCost: 80,
      });

      expect(result.maBefore).toBe(50);
      expect(result.maAfter).toBe(60);
      expect(result.stockBefore).toBe(100);
      expect(result.stockAfter).toBe(150);
      expect(result.totalValueAfter).toBe(9000);
    });

    it('should return 0 MA when resulting qty is 0', () => {
      const result = service.calculateMa({
        currentQty: 10,
        currentMa: 50,
        qtyChange: -10,
        unitCost: 50,
      });

      expect(result.maAfter).toBe(0);
      expect(result.stockAfter).toBe(0);
    });
  });

  describe('calculateStockOut', () => {
    it('should keep MA unchanged on stock-out', () => {
      const result = service.calculateStockOut(100, 50, 30);

      expect(result.maBefore).toBe(50);
      expect(result.maAfter).toBe(50); // MA unchanged
      expect(result.stockBefore).toBe(100);
      expect(result.stockAfter).toBe(70);
      expect(result.totalValueAfter).toBe(3500);
    });
  });

  describe('getCurrentMa', () => {
    it('should return MA from loaded balances', async () => {
      const ma = await service.getCurrentMa('item-1', 'wh-1');
      expect(ma).toBe(50);
    });

    it('should return 0 for unknown item', async () => {
      const ma = await service.getCurrentMa('unknown', 'wh-1');
      expect(ma).toBe(0);
    });
  });

  describe('updateBalance', () => {
    it('should update balance for an item', async () => {
      service.updateBalance('item-1', 'wh-1', 150, 60);
      const ma = await service.getCurrentMa('item-1', 'wh-1');
      expect(ma).toBe(60);
      expect(service.getStockQty('item-1', 'wh-1')).toBe(150);
    });
  });
});
