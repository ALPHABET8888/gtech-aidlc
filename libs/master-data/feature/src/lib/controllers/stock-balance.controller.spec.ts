import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StockBalanceController } from './stock-balance.controller';
import { StockBalanceService } from '../services/stock-balance.service';
import { Prisma } from '@prisma/client';

describe('StockBalanceController', () => {
  let controller: StockBalanceController;
  let service: jest.Mocked<StockBalanceService>;

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

  const mockPaginatedResult = {
    data: [mockStockBalance],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockBalanceController],
      providers: [
        {
          provide: StockBalanceService,
          useValue: {
            findAll: jest.fn(),
            findByItemAndWarehouse: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<StockBalanceController>(StockBalanceController);
    service = module.get(StockBalanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /stock-balance', () => {
    it('should return paginated stock balances with default params', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith(
        { itemId: undefined, warehouseId: undefined },
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass itemId filter from query', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      await controller.findAll({
        itemId: mockStockBalance.itemId,
        page: 1,
        pageSize: 10,
      });

      expect(service.findAll).toHaveBeenCalledWith(
        { itemId: mockStockBalance.itemId, warehouseId: undefined },
        { page: 1, pageSize: 10 },
      );
    });

    it('should pass warehouseId filter from query', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      await controller.findAll({
        warehouseId: mockStockBalance.warehouseId,
        page: 2,
        pageSize: 5,
      });

      expect(service.findAll).toHaveBeenCalledWith(
        { itemId: undefined, warehouseId: mockStockBalance.warehouseId },
        { page: 2, pageSize: 5 },
      );
    });

    it('should pass both itemId and warehouseId filters', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      await controller.findAll({
        itemId: mockStockBalance.itemId,
        warehouseId: mockStockBalance.warehouseId,
      });

      expect(service.findAll).toHaveBeenCalledWith(
        { itemId: mockStockBalance.itemId, warehouseId: mockStockBalance.warehouseId },
        { page: 1, pageSize: 20 },
      );
    });
  });

  describe('GET /stock-balance/:itemId/:warehouseId', () => {
    it('should return stock balance for specific item+warehouse', async () => {
      service.findByItemAndWarehouse.mockResolvedValue(mockStockBalance);

      const result = await controller.findByItemAndWarehouse(
        mockStockBalance.itemId,
        mockStockBalance.warehouseId,
      );

      expect(service.findByItemAndWarehouse).toHaveBeenCalledWith(
        mockStockBalance.itemId,
        mockStockBalance.warehouseId,
      );
      expect(result).toEqual(mockStockBalance);
    });

    it('should propagate NotFoundException from service', async () => {
      service.findByItemAndWarehouse.mockRejectedValue(
        new NotFoundException('Stock balance not found'),
      );

      await expect(
        controller.findByItemAndWarehouse(
          '550e8400-e29b-41d4-a716-446655440090',
          '550e8400-e29b-41d4-a716-446655440091',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
