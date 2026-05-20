import { Test, TestingModule } from '@nestjs/testing';
import { ApArStatus, Prisma } from '@prisma/client';
import { ArService, CreateArOpenItemInput } from './ar.service';
import { ArOpenItemRepository } from '@autoflow/transactions-data-access';
import { OpenItemNotFoundException, PaymentExceedsBalanceException } from '../exceptions';

describe('ArService', () => {
  let service: ArService;
  let repository: jest.Mocked<ArOpenItemRepository>;

  const mockArOpenItem = {
    id: 'ar-item-1',
    customerId: 'customer-1',
    txId: 'tx-1',
    txType: 'SALE_INVOICE',
    originalAmount: new Prisma.Decimal(8000),
    remainingAmount: new Prisma.Decimal(8000),
    vatAmount: new Prisma.Decimal(560),
    status: ApArStatus.OPEN,
    taxInvoiceNo: 'SI-001',
    dueDate: new Date('2024-03-15'),
    period: '2024-02',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      findOpenByCustomer: jest.fn(),
      update: jest.fn(),
      updateRemainingAndStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArService,
        { provide: ArOpenItemRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<ArService>(ArService);
    repository = module.get(ArOpenItemRepository);
  });

  describe('createArOpenItem', () => {
    it('should create an AR open item with OPEN status and remainingAmount = originalAmount', async () => {
      const input: CreateArOpenItemInput = {
        customerId: 'customer-1',
        txId: 'tx-1',
        txType: 'SALE_INVOICE',
        originalAmount: 8000,
        vatAmount: 560,
        taxInvoiceNo: 'SI-001',
        dueDate: new Date('2024-03-15'),
        period: '2024-02',
      };

      repository.create.mockResolvedValue(mockArOpenItem);

      const result = await service.createArOpenItem(input);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-1',
          txId: 'tx-1',
          txType: 'SALE_INVOICE',
          originalAmount: new Prisma.Decimal(8000),
          remainingAmount: new Prisma.Decimal(8000),
          vatAmount: new Prisma.Decimal(560),
          status: ApArStatus.OPEN,
          taxInvoiceNo: 'SI-001',
          period: '2024-02',
        }),
      );
      expect(result).toEqual(mockArOpenItem);
    });

    it('should create AR open item without taxInvoiceNo when not provided', async () => {
      const input: CreateArOpenItemInput = {
        customerId: 'customer-1',
        txId: 'tx-2',
        txType: 'TEMP_DO',
        originalAmount: 5000,
        vatAmount: 350,
        period: '2024-02',
      };

      repository.create.mockResolvedValue({ ...mockArOpenItem, taxInvoiceNo: null });

      await service.createArOpenItem(input);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taxInvoiceNo: null,
          dueDate: null,
        }),
      );
    });
  });

  describe('reduceArByCn', () => {
    it('should reduce remaining amount and set status to PARTIAL', async () => {
      repository.findById.mockResolvedValue(mockArOpenItem);
      repository.updateRemainingAndStatus.mockResolvedValue({
        ...mockArOpenItem,
        remainingAmount: new Prisma.Decimal(5000),
        status: ApArStatus.PARTIAL,
      });

      const result = await service.reduceArByCn('ar-item-1', 3000);

      expect(repository.updateRemainingAndStatus).toHaveBeenCalledWith(
        'ar-item-1',
        new Prisma.Decimal(5000),
        ApArStatus.PARTIAL,
      );
      expect(result.status).toBe(ApArStatus.PARTIAL);
    });

    it('should set status to CLOSED when remaining becomes 0', async () => {
      repository.findById.mockResolvedValue(mockArOpenItem);
      repository.updateRemainingAndStatus.mockResolvedValue({
        ...mockArOpenItem,
        remainingAmount: new Prisma.Decimal(0),
        status: ApArStatus.CLOSED,
      });

      const result = await service.reduceArByCn('ar-item-1', 8000);

      expect(repository.updateRemainingAndStatus).toHaveBeenCalledWith(
        'ar-item-1',
        new Prisma.Decimal(0),
        ApArStatus.CLOSED,
      );
      expect(result.status).toBe(ApArStatus.CLOSED);
    });

    it('should throw OpenItemNotFoundException when item does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.reduceArByCn('non-existent', 1000)).rejects.toThrow(
        OpenItemNotFoundException,
      );
    });

    it('should throw PaymentExceedsBalanceException when amount exceeds remaining', async () => {
      repository.findById.mockResolvedValue(mockArOpenItem);

      await expect(service.reduceArByCn('ar-item-1', 12000)).rejects.toThrow(
        PaymentExceedsBalanceException,
      );
    });

    it('should handle partial item correctly (reduce from already-partial)', async () => {
      const partialItem = {
        ...mockArOpenItem,
        remainingAmount: new Prisma.Decimal(4000),
        status: ApArStatus.PARTIAL,
      };
      repository.findById.mockResolvedValue(partialItem);
      repository.updateRemainingAndStatus.mockResolvedValue({
        ...partialItem,
        remainingAmount: new Prisma.Decimal(1000),
        status: ApArStatus.PARTIAL,
      });

      const result = await service.reduceArByCn('ar-item-1', 3000);

      expect(repository.updateRemainingAndStatus).toHaveBeenCalledWith(
        'ar-item-1',
        new Prisma.Decimal(1000),
        ApArStatus.PARTIAL,
      );
      expect(result.status).toBe(ApArStatus.PARTIAL);
    });
  });

  describe('getOpenArItems', () => {
    it('should return paginated AR items', async () => {
      const items = [mockArOpenItem];
      repository.findMany.mockResolvedValue({ data: items, total: 1 });

      const result = await service.getOpenArItems({ page: 1, limit: 20 });

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

      await service.getOpenArItems({
        customerId: 'customer-1',
        status: ApArStatus.OPEN,
        page: 2,
        limit: 10,
      });

      expect(repository.findMany).toHaveBeenCalledWith({
        customerId: 'customer-1',
        status: ApArStatus.OPEN,
        page: 2,
        limit: 10,
      });
    });

    it('should use default pagination when not specified', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 0 });

      const result = await service.getOpenArItems({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('should calculate totalPages correctly', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 45 });

      const result = await service.getOpenArItems({ page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
    });
  });
});
