import { Test, TestingModule } from '@nestjs/testing';
import { StockValidationService } from './stock-validation.service';
import { StockBalanceRepository } from '@autoflow/master-data-data-access';
import { StockNegativeException, StockFrozenException } from '@autoflow/shared-errors';

describe('StockValidationService', () => {
  let service: StockValidationService;
  let stockBalanceRepository: jest.Mocked<StockBalanceRepository>;

  // Prisma Decimal mock — Number() coerces via valueOf/toString
  const createDecimal = (value: number) => {
    const d = Object.create(null);
    d.valueOf = () => value;
    d.toString = () => String(value);
    d[Symbol.toPrimitive] = () => value;
    return d;
  };

  const mockStockBalance = (qty: number, isFrozen = false) => ({
    id: '550e8400-e29b-41d4-a716-446655440010',
    itemId: 'item-001',
    warehouseId: 'wh-001',
    qty: createDecimal(qty),
    totalValue: createDecimal(qty * 100),
    ma: createDecimal(100),
    isFrozen,
    lastTxId: null,
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockValidationService,
        {
          provide: StockBalanceRepository,
          useValue: {
            findByItemWarehouse: jest.fn(),
            findByItemWarehouseForUpdate: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockValidationService>(StockValidationService);
    stockBalanceRepository = module.get(StockBalanceRepository);
  });

  describe('validateStockAvailable', () => {
    it('should pass when stock is sufficient', async () => {
      // Current stock: 50, requesting: 30 → should pass
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(
        mockStockBalance(50) as any,
      );

      await expect(
        service.validateStockAvailable('item-001', 'wh-001', 30),
      ).resolves.toBeUndefined();

      expect(stockBalanceRepository.findByItemWarehouse).toHaveBeenCalledWith(
        'item-001',
        'wh-001',
      );
    });

    it('should pass when stock equals requested qty (zero remaining)', async () => {
      // Current stock: 10, requesting: 10 → should pass (stock_before - qty = 0)
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(
        mockStockBalance(10) as any,
      );

      await expect(
        service.validateStockAvailable('item-001', 'wh-001', 10),
      ).resolves.toBeUndefined();
    });

    it('should throw StockNegativeException when stock is insufficient', async () => {
      // Current stock: 5, requesting: 10 → should throw
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(
        mockStockBalance(5) as any,
      );

      await expect(
        service.validateStockAvailable('item-001', 'wh-001', 10),
      ).rejects.toThrow(StockNegativeException);
    });

    it('should throw StockNegativeException when no stock balance exists', async () => {
      // No stock balance record → current qty = 0, requesting: 5 → should throw
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(null);

      await expect(
        service.validateStockAvailable('item-001', 'wh-001', 5),
      ).rejects.toThrow(StockNegativeException);
    });

    it('should throw StockFrozenException when stock is frozen', async () => {
      // Stock is frozen during count — should throw regardless of qty
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(
        mockStockBalance(100, true) as any,
      );

      await expect(
        service.validateStockAvailable('item-001', 'wh-001', 1),
      ).rejects.toThrow(StockFrozenException);
    });

    it('should check frozen flag before stock quantity', async () => {
      // Stock is frozen AND insufficient — should throw StockFrozenException (not StockNegative)
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(
        mockStockBalance(0, true) as any,
      );

      await expect(
        service.validateStockAvailable('item-001', 'wh-001', 10),
      ).rejects.toThrow(StockFrozenException);
    });
  });

  describe('getStockBalance', () => {
    it('should return current stock quantity', async () => {
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(
        mockStockBalance(42) as any,
      );

      const qty = await service.getStockBalance('item-001', 'wh-001');

      expect(qty).toBe(42);
      expect(stockBalanceRepository.findByItemWarehouse).toHaveBeenCalledWith(
        'item-001',
        'wh-001',
      );
    });

    it('should return 0 when no stock balance exists', async () => {
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(null);

      const qty = await service.getStockBalance('item-001', 'wh-001');

      expect(qty).toBe(0);
    });
  });
});
