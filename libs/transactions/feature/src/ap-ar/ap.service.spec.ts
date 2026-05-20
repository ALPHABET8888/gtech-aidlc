import { Test, TestingModule } from '@nestjs/testing';
import { ApArStatus, Prisma } from '@prisma/client';
import { ApService, CreateApOpenItemInput } from './ap.service';
import { ApOpenItemRepository } from '@autoflow/transactions-data-access';
import { OpenItemNotFoundException, PaymentExceedsBalanceException } from '../exceptions';

describe('ApService', () => {
  let service: ApService;
  let repository: jest.Mocked<ApOpenItemRepository>;

  const mockApOpenItem = {
    id: 'ap-item-1',
    vendorId: 'vendor-1',
    txId: 'tx-1',
    txType: 'GR_RECEIVE',
    originalAmount: new Prisma.Decimal(10000),
    remainingAmount: new Prisma.Decimal(10000),
    vatAmount: new Prisma.Decimal(700),
    status: ApArStatus.OPEN,
    taxInvoiceNo: 'INV-001',
    dueDate: new Date('2024-03-01'),
    period: '2024-02',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      findOpenByVendor: jest.fn(),
      update: jest.fn(),
      updateRemainingAndStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApService,
        { provide: ApOpenItemRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ApService>(ApService);
    repository = module.get(ApOpenItemRepository);
  });

  describe('createApOpenItem', () => {
    it('should create an AP open item with OPEN status and remainingAmount = originalAmount', async () => {
      const input: CreateApOpenItemInput = {
        vendorId: 'vendor-1',
        txId: 'tx-1',
        txType: 'GR_RECEIVE',
        originalAmount: 10000,
        vatAmount: 700,
        taxInvoiceNo: 'INV-001',
        dueDate: new Date('2024-03-01'),
        period: '2024-02',
      };

      repository.create.mockResolvedValue(mockApOpenItem);

      const result = await service.createApOpenItem(input);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorId: 'vendor-1',
          txId: 'tx-1',
          txType: 'GR_RECEIVE',
          originalAmount: new Prisma.Decimal(10000),
          remainingAmount: new Prisma.Decimal(10000),
          vatAmount: new Prisma.Decimal(700),
          status: ApArStatus.OPEN,
          taxInvoiceNo: 'INV-001',
          period: '2024-02',
        }),
      );
      expect(result).toEqual(mockApOpenItem);
    });

    it('should create AP open item without dueDate when not provided', async () => {
      const input: CreateApOpenItemInput = {
        vendorId: 'vendor-1',
        txId: 'tx-1',
        txType: 'GR_RECEIVE',
        originalAmount: 5000,
        vatAmount: 350,
        taxInvoiceNo: 'INV-002',
        period: '2024-02',
      };

      repository.create.mockResolvedValue({ ...mockApOpenItem, dueDate: null });

      await service.createApOpenItem(input);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: null,
        }),
      );
    });
  });

  describe('reduceApByCn', () => {
    it('should reduce remaining amount and set status to PARTIAL', async () => {
      repository.findById.mockResolvedValue(mockApOpenItem);
      repository.updateRemainingAndStatus.mockResolvedValue({
        ...mockApOpenItem,
        remainingAmount: new Prisma.Decimal(7000),
        status: ApArStatus.PARTIAL,
      });

      const result = await service.reduceApByCn('ap-item-1', 3000);

      expect(repository.updateRemainingAndStatus).toHaveBeenCalledWith(
        'ap-item-1',
        new Prisma.Decimal(7000),
        ApArStatus.PARTIAL,
      );
      expect(result.status).toBe(ApArStatus.PARTIAL);
    });

    it('should set status to CLOSED when remaining becomes 0', async () => {
      repository.findById.mockResolvedValue(mockApOpenItem);
      repository.updateRemainingAndStatus.mockResolvedValue({
        ...mockApOpenItem,
        remainingAmount: new Prisma.Decimal(0),
        status: ApArStatus.CLOSED,
      });

      const result = await service.reduceApByCn('ap-item-1', 10000);

      expect(repository.updateRemainingAndStatus).toHaveBeenCalledWith(
        'ap-item-1',
        new Prisma.Decimal(0),
        ApArStatus.CLOSED,
      );
      expect(result.status).toBe(ApArStatus.CLOSED);
    });

    it('should throw OpenItemNotFoundException when item does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.reduceApByCn('non-existent', 1000)).rejects.toThrow(
        OpenItemNotFoundException,
      );
    });

    it('should throw PaymentExceedsBalanceException when amount exceeds remaining', async () => {
      repository.findById.mockResolvedValue(mockApOpenItem);

      await expect(service.reduceApByCn('ap-item-1', 15000)).rejects.toThrow(
        PaymentExceedsBalanceException,
      );
    });
  });

  describe('getOpenApItems', () => {
    it('should return paginated AP items', async () => {
      const items = [mockApOpenItem];
      repository.findMany.mockResolvedValue({ data: items, total: 1 });

      const result = await service.getOpenApItems({ page: 1, limit: 20 });

      expect(result.data).toEqual(items);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should pass filter options to repository', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.getOpenApItems({
        vendorId: 'vendor-1',
        status: ApArStatus.OPEN,
        page: 2,
        limit: 10,
      });

      expect(repository.findMany).toHaveBeenCalledWith({
        vendorId: 'vendor-1',
        status: ApArStatus.OPEN,
        page: 2,
        limit: 10,
      });
    });

    it('should use default pagination when not specified', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 0 });

      const result = await service.getOpenApItems({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });
  });
});
