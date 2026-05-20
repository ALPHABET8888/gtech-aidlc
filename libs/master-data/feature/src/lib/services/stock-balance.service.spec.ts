import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StockBalanceService } from './stock-balance.service';
import { StockBalanceRepository } from '@autoflow/master-data-data-access';
import { Prisma } from '@prisma/client';

describe('StockBalanceService', () => {
  let service: StockBalanceService;
  let repository: jest.Mocked<StockBalanceRepository>;

  const mockStockBalance = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    itemId: '550e8400-e29b-41d4-a716-446655440001',
    warehouseId: '550e8400-e29b-41d4-a716-446655440002',
    qty: new Prisma.Decimal('100.0000'),
    totalValue: new Prisma.Decimal('5000.00'),
    ma: new Prisma.Decimal('50.00'),
    isFrozen: false,
    lastTxId: '550e8400-e29b-41d4-a716-446655440099',
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockBalanceService,
        {
          provide: StockBalanceRepository,
          useValue: {
            findMany: jest.fn(),
            findByItemWarehouse: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StockBalanceService>(StockBalanceService);
    repository = module.get(StockBalanceRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockPaginatedResult = {
      data: [mockStockBalance],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated stock balances with default pagination', async () => {
      repository.findMany.mockResolvedValue(mockPaginatedResult);

      const result = await service.findAll();

      expect(repository.findMany).toHaveBeenCalledWith(
        {},
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass filters and pagination to repository', async () => {
      repository.findMany.mockResolvedValue(mockPaginatedResult);

      const filters = { itemId: mockStockBalance.itemId, warehouseId: mockStockBalance.warehouseId };
      const pagination = { page: 2, pageSize: 10 };

      await service.findAll(filters, pagination);

      expect(repository.findMany).toHaveBeenCalledWith(filters, pagination);
    });

    it('should return empty result when no stock balances match filters', async () => {
      const emptyResult = {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      };
      repository.findMany.mockResolvedValue(emptyResult);

      const result = await service.findAll({ itemId: 'non-existent-id' });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('findByItemAndWarehouse', () => {
    it('should return stock balance when found', async () => {
      repository.findByItemWarehouse.mockResolvedValue(mockStockBalance);

      const result = await service.findByItemAndWarehouse(
        mockStockBalance.itemId,
        mockStockBalance.warehouseId,
      );

      expect(repository.findByItemWarehouse).toHaveBeenCalledWith(
        mockStockBalance.itemId,
        mockStockBalance.warehouseId,
      );
      expect(result).toEqual(mockStockBalance);
    });

    it('should throw NotFoundException when stock balance not found', async () => {
      repository.findByItemWarehouse.mockResolvedValue(null);

      await expect(
        service.findByItemAndWarehouse(
          '550e8400-e29b-41d4-a716-446655440090',
          '550e8400-e29b-41d4-a716-446655440091',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
