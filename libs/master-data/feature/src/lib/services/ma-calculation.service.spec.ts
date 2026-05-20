import { Test, TestingModule } from '@nestjs/testing';
import { MaCalculationService, MaResult } from './ma-calculation.service';
import { StockBalanceRepository } from '@autoflow/master-data-data-access';

describe('MaCalculationService', () => {
  let service: MaCalculationService;
  let stockBalanceRepository: jest.Mocked<StockBalanceRepository>;

  // Prisma Decimal is a Decimal.js instance; Number() coerces it via valueOf/toString
  const createDecimal = (value: number) => {
    const d = Object.create(null);
    d.valueOf = () => value;
    d.toString = () => String(value);
    d[Symbol.toPrimitive] = () => value;
    return d;
  };

  const mockStockBalance = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    itemId: 'item-001',
    warehouseId: 'wh-001',
    qty: createDecimal(10),
    totalValue: createDecimal(1000),
    ma: createDecimal(100),
    isFrozen: false,
    lastTxId: null,
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaCalculationService,
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

    service = module.get<MaCalculationService>(MaCalculationService);
    stockBalanceRepository = module.get(StockBalanceRepository);
  });

  describe('calculateNewMa - stock increase', () => {
    it('should calculate new MA correctly for stock increase', async () => {
      // Existing: qty=10, totalValue=1000, ma=100
      // Incoming: qty=5, value=600 (cost per unit = 120)
      // Expected new MA: (1000 + 600) / (10 + 5) = 1600 / 15 ≈ 106.67
      stockBalanceRepository.findByItemWarehouseForUpdate.mockResolvedValue(mockStockBalance);
      stockBalanceRepository.upsert.mockResolvedValue(mockStockBalance);

      const result: MaResult = await service.calculateNewMa(
        'item-001',
        'wh-001',
        5,   // qty
        600, // value
        true, // isIncrease
      );

      expect(result.maBefore).toBe(100);
      expect(result.maAfter).toBeCloseTo(106.67, 1);
      expect(result.stockBefore).toBe(10);
      expect(result.stockAfter).toBe(15);

      // Verify upsert was called with correct values
      expect(stockBalanceRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-001',
          warehouseId: 'wh-001',
          qty: 15,
          totalValue: 1600,
          ma: expect.closeTo(106.67, 1),
        }),
        undefined,
      );
    });

    it('should handle first-ever stock receipt (zero stock edge case)', async () => {
      // No existing stock balance — first receipt
      // Incoming: qty=20, value=2000 (cost per unit = 100)
      // Expected new MA: 2000 / 20 = 100
      stockBalanceRepository.findByItemWarehouseForUpdate.mockResolvedValue(null);
      stockBalanceRepository.upsert.mockResolvedValue(mockStockBalance);

      const result: MaResult = await service.calculateNewMa(
        'item-001',
        'wh-001',
        20,    // qty
        2000,  // value
        true,  // isIncrease
      );

      expect(result.maBefore).toBe(0);
      expect(result.maAfter).toBe(100);
      expect(result.stockBefore).toBe(0);
      expect(result.stockAfter).toBe(20);

      expect(stockBalanceRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-001',
          warehouseId: 'wh-001',
          qty: 20,
          totalValue: 2000,
          ma: 100,
        }),
        undefined,
      );
    });
  });

  describe('calculateNewMa - stock decrease', () => {
    it('should not change MA on stock decrease', async () => {
      // Existing: qty=10, totalValue=1000, ma=100
      // Decrease: qty=3
      // Expected: MA unchanged at 100, stock goes from 10 to 7
      // New total value = 100 * 7 = 700
      stockBalanceRepository.findByItemWarehouseForUpdate.mockResolvedValue(mockStockBalance);
      stockBalanceRepository.upsert.mockResolvedValue(mockStockBalance);

      const result: MaResult = await service.calculateNewMa(
        'item-001',
        'wh-001',
        3,    // qty
        300,  // value (not used for MA calc on decrease)
        false, // isIncrease = false → decrease
      );

      expect(result.maBefore).toBe(100);
      expect(result.maAfter).toBe(100); // MA unchanged
      expect(result.stockBefore).toBe(10);
      expect(result.stockAfter).toBe(7);

      expect(stockBalanceRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-001',
          warehouseId: 'wh-001',
          qty: 7,
          totalValue: 700, // MA * newQty = 100 * 7
          ma: 100,
        }),
        undefined,
      );
    });
  });

  describe('calculateNewMa - zero stock edge case', () => {
    it('should handle decrease to zero stock', async () => {
      // Existing: qty=10, totalValue=1000, ma=100
      // Decrease all: qty=10
      // Expected: MA stays at 100, stock goes to 0, totalValue = 0
      stockBalanceRepository.findByItemWarehouseForUpdate.mockResolvedValue(mockStockBalance);
      stockBalanceRepository.upsert.mockResolvedValue(mockStockBalance);

      const result: MaResult = await service.calculateNewMa(
        'item-001',
        'wh-001',
        10,
        1000,
        false, // decrease
      );

      expect(result.maBefore).toBe(100);
      expect(result.maAfter).toBe(100); // MA unchanged even at zero stock
      expect(result.stockBefore).toBe(10);
      expect(result.stockAfter).toBe(0);

      expect(stockBalanceRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          qty: 0,
          totalValue: 0, // 100 * 0 = 0
          ma: 100,
        }),
        undefined,
      );
    });
  });

  describe('calculateNewMa - with transaction client', () => {
    it('should pass transaction client to repository methods', async () => {
      const mockTx = {} as any; // Mock Prisma.TransactionClient
      stockBalanceRepository.findByItemWarehouseForUpdate.mockResolvedValue(mockStockBalance);
      stockBalanceRepository.upsert.mockResolvedValue(mockStockBalance);

      await service.calculateNewMa('item-001', 'wh-001', 5, 600, true, mockTx);

      expect(stockBalanceRepository.findByItemWarehouseForUpdate).toHaveBeenCalledWith(
        'item-001',
        'wh-001',
        mockTx,
      );
      expect(stockBalanceRepository.upsert).toHaveBeenCalledWith(
        expect.any(Object),
        mockTx,
      );
    });
  });

  describe('getCurrentMa', () => {
    it('should return current MA from stock balance', async () => {
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(mockStockBalance);

      const ma = await service.getCurrentMa('item-001', 'wh-001');

      expect(ma).toBe(100);
      expect(stockBalanceRepository.findByItemWarehouse).toHaveBeenCalledWith(
        'item-001',
        'wh-001',
      );
    });

    it('should return 0 when no stock balance exists', async () => {
      stockBalanceRepository.findByItemWarehouse.mockResolvedValue(null);

      const ma = await service.getCurrentMa('item-001', 'wh-001');

      expect(ma).toBe(0);
    });
  });
});
