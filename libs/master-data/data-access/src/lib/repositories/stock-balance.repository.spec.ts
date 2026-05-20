import { Test, TestingModule } from '@nestjs/testing';
import { StockBalanceRepository } from './stock-balance.repository';
import { PrismaService } from '@autoflow/shared-prisma';
import { Prisma } from '@prisma/client';

describe('StockBalanceRepository', () => {
  let repository: StockBalanceRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockStockBalance = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    itemId: '550e8400-e29b-41d4-a716-446655440001',
    warehouseId: '550e8400-e29b-41d4-a716-446655440002',
    qty: new Prisma.Decimal('100.0000'),
    totalValue: new Prisma.Decimal('5000.00'),
    ma: new Prisma.Decimal('50.00'),
    isFrozen: false,
    lastTxId: '550e8400-e29b-41d4-a716-446655440020',
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      stockBalance: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockBalanceRepository,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    repository = module.get<StockBalanceRepository>(StockBalanceRepository);
    prisma = module.get(PrismaService);
  });

  describe('findByItemWarehouse', () => {
    it('should return stock balance for item+warehouse pair', async () => {
      (prisma.stockBalance.findUnique as jest.Mock).mockResolvedValue(
        mockStockBalance,
      );

      const result = await repository.findByItemWarehouse(
        mockStockBalance.itemId,
        mockStockBalance.warehouseId,
      );

      expect(prisma.stockBalance.findUnique).toHaveBeenCalledWith({
        where: {
          idx_stock_balance_item_wh: {
            itemId: mockStockBalance.itemId,
            warehouseId: mockStockBalance.warehouseId,
          },
        },
      });
      expect(result).toEqual(mockStockBalance);
    });

    it('should return null when no balance exists', async () => {
      (prisma.stockBalance.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findByItemWarehouse(
        'non-existent-item',
        'non-existent-warehouse',
      );

      expect(result).toBeNull();
    });
  });

  describe('findByItemWarehouseForUpdate', () => {
    it('should execute raw SELECT FOR UPDATE query and return result', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([mockStockBalance]);

      const result = await repository.findByItemWarehouseForUpdate(
        mockStockBalance.itemId,
        mockStockBalance.warehouseId,
      );

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(result).toEqual(mockStockBalance);
    });

    it('should return null when no row matches', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await repository.findByItemWarehouseForUpdate(
        'non-existent-item',
        'non-existent-warehouse',
      );

      expect(result).toBeNull();
    });

    it('should use transaction client when provided', async () => {
      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue([mockStockBalance]),
      } as any;

      const result = await repository.findByItemWarehouseForUpdate(
        mockStockBalance.itemId,
        mockStockBalance.warehouseId,
        mockTx,
      );

      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(result).toEqual(mockStockBalance);
    });
  });

  describe('upsert', () => {
    it('should upsert stock balance with all fields', async () => {
      (prisma.stockBalance.upsert as jest.Mock).mockResolvedValue(
        mockStockBalance,
      );

      const data = {
        itemId: mockStockBalance.itemId,
        warehouseId: mockStockBalance.warehouseId,
        qty: new Prisma.Decimal('100.0000'),
        totalValue: new Prisma.Decimal('5000.00'),
        ma: new Prisma.Decimal('50.00'),
        lastTxId: '550e8400-e29b-41d4-a716-446655440020',
      };

      const result = await repository.upsert(data);

      expect(prisma.stockBalance.upsert).toHaveBeenCalledWith({
        where: {
          idx_stock_balance_item_wh: {
            itemId: data.itemId,
            warehouseId: data.warehouseId,
          },
        },
        create: {
          item: { connect: { id: data.itemId } },
          warehouse: { connect: { id: data.warehouseId } },
          qty: data.qty,
          totalValue: data.totalValue,
          ma: data.ma,
          isFrozen: false,
          lastTx: { connect: { id: data.lastTxId } },
        },
        update: {
          qty: data.qty,
          totalValue: data.totalValue,
          ma: data.ma,
          lastTxId: data.lastTxId,
        },
      });
      expect(result).toEqual(mockStockBalance);
    });

    it('should upsert without lastTxId when not provided', async () => {
      (prisma.stockBalance.upsert as jest.Mock).mockResolvedValue(
        mockStockBalance,
      );

      const data = {
        itemId: mockStockBalance.itemId,
        warehouseId: mockStockBalance.warehouseId,
        qty: new Prisma.Decimal('50.0000'),
        totalValue: new Prisma.Decimal('2500.00'),
        ma: new Prisma.Decimal('50.00'),
      };

      await repository.upsert(data);

      expect(prisma.stockBalance.upsert).toHaveBeenCalledWith({
        where: {
          idx_stock_balance_item_wh: {
            itemId: data.itemId,
            warehouseId: data.warehouseId,
          },
        },
        create: {
          item: { connect: { id: data.itemId } },
          warehouse: { connect: { id: data.warehouseId } },
          qty: data.qty,
          totalValue: data.totalValue,
          ma: data.ma,
          isFrozen: false,
        },
        update: {
          qty: data.qty,
          totalValue: data.totalValue,
          ma: data.ma,
        },
      });
    });

    it('should use transaction client when provided', async () => {
      const mockTx = {
        stockBalance: {
          upsert: jest.fn().mockResolvedValue(mockStockBalance),
        },
      } as any;

      const data = {
        itemId: mockStockBalance.itemId,
        warehouseId: mockStockBalance.warehouseId,
        qty: new Prisma.Decimal('100.0000'),
        totalValue: new Prisma.Decimal('5000.00'),
        ma: new Prisma.Decimal('50.00'),
      };

      const result = await repository.upsert(data, mockTx);

      expect(mockTx.stockBalance.upsert).toHaveBeenCalled();
      expect(prisma.stockBalance.upsert).not.toHaveBeenCalled();
      expect(result).toEqual(mockStockBalance);
    });

    it('should handle isFrozen flag in upsert', async () => {
      (prisma.stockBalance.upsert as jest.Mock).mockResolvedValue({
        ...mockStockBalance,
        isFrozen: true,
      });

      const data = {
        itemId: mockStockBalance.itemId,
        warehouseId: mockStockBalance.warehouseId,
        qty: new Prisma.Decimal('100.0000'),
        totalValue: new Prisma.Decimal('5000.00'),
        ma: new Prisma.Decimal('50.00'),
        isFrozen: true,
      };

      const result = await repository.upsert(data);

      expect(prisma.stockBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isFrozen: true }),
          update: expect.objectContaining({ isFrozen: true }),
        }),
      );
      expect(result.isFrozen).toBe(true);
    });
  });
});
