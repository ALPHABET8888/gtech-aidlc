import { Test, TestingModule } from '@nestjs/testing';
import { TxLogRepository } from './tx-log.repository';
import { PrismaService } from '@autoflow/shared-prisma';
import { ImmutableTxException } from '@autoflow/shared-errors';
import { TxStatus, TxType } from '@prisma/client';

describe('TxLogRepository', () => {
  let repository: TxLogRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockTxLog = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    txType: TxType.GR_RECEIVE,
    txStatus: TxStatus.DRAFT,
    txDate: new Date('2025-01-20T00:00:00Z'),
    period: '2025-01',
    itemId: '550e8400-e29b-41d4-a716-446655440001',
    warehouseId: '550e8400-e29b-41d4-a716-446655440002',
    qty: 100,
    unitCost: 50.0,
    totalCost: 5000.0,
    maBefore: null,
    maAfter: null,
    stockBefore: null,
    stockAfter: null,
    vendorId: '550e8400-e29b-41d4-a716-446655440003',
    customerId: null,
    refJoId: null,
    refDoId: null,
    refInvoiceId: null,
    refGrId: null,
    refCnId: null,
    parentTxId: null,
    taxInvoiceNo: 'INV-001',
    baseAmount: 5000.0,
    vatAmount: 350.0,
    vatType: 'INPUT',
    arAmount: null,
    apAmount: 5000.0,
    apArStatus: 'OPEN',
    cogsUnit: null,
    reason: null,
    approvedBy: null,
    approvedAt: null,
    createdBy: '550e8400-e29b-41d4-a716-446655440004',
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      txLog: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxLogRepository,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    repository = module.get<TxLogRepository>(TxLogRepository);
    prisma = module.get(PrismaService);
  });

  describe('create', () => {
    it('should create a new TX Log entry', async () => {
      const createData = {
        txType: TxType.GR_RECEIVE,
        txDate: new Date('2025-01-20T00:00:00Z'),
        period: '2025-01',
        createdBy: '550e8400-e29b-41d4-a716-446655440004',
      } as any;

      (prisma.txLog.create as jest.Mock).mockResolvedValue(mockTxLog);

      const result = await repository.create(createData);

      expect(prisma.txLog.create).toHaveBeenCalledWith({ data: createData });
      expect(result).toEqual(mockTxLog);
    });
  });

  describe('findById', () => {
    it('should return a TX Log entry by ID', async () => {
      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(mockTxLog);

      const result = await repository.findById(mockTxLog.id);

      expect(prisma.txLog.findUnique).toHaveBeenCalledWith({
        where: { id: mockTxLog.id },
      });
      expect(result).toEqual(mockTxLog);
    });

    it('should return null when TX not found', async () => {
      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('should return paginated results with default pagination', async () => {
      const txLogs = [mockTxLog];
      (prisma.txLog.findMany as jest.Mock).mockResolvedValue(txLogs);
      (prisma.txLog.count as jest.Mock).mockResolvedValue(1);

      const result = await repository.findMany();

      expect(prisma.txLog.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual(txLogs);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should apply filters correctly', async () => {
      (prisma.txLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.txLog.count as jest.Mock).mockResolvedValue(0);

      await repository.findMany(
        {
          txType: TxType.GR_RECEIVE,
          txStatus: TxStatus.POSTED,
          period: '2025-01',
          itemId: 'item-uuid',
          warehouseId: 'warehouse-uuid',
        },
        { page: 2, pageSize: 10 },
      );

      expect(prisma.txLog.findMany).toHaveBeenCalledWith({
        where: {
          txType: TxType.GR_RECEIVE,
          txStatus: TxStatus.POSTED,
          period: '2025-01',
          itemId: 'item-uuid',
          warehouseId: 'warehouse-uuid',
        },
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should apply date range filters', async () => {
      const dateFrom = new Date('2025-01-01T00:00:00Z');
      const dateTo = new Date('2025-01-31T23:59:59Z');

      (prisma.txLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.txLog.count as jest.Mock).mockResolvedValue(0);

      await repository.findMany({ dateFrom, dateTo });

      expect(prisma.txLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            txDate: { gte: dateFrom, lte: dateTo },
          },
        }),
      );
    });

    it('should calculate totalPages correctly', async () => {
      (prisma.txLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.txLog.count as jest.Mock).mockResolvedValue(55);

      const result = await repository.findMany({}, { page: 1, pageSize: 10 });

      expect(result.pagination.totalPages).toBe(6);
    });
  });

  describe('updateStatus', () => {
    it('should allow DRAFT → POSTED transition', async () => {
      const draftTx = { ...mockTxLog, txStatus: TxStatus.DRAFT };
      const postedTx = { ...mockTxLog, txStatus: TxStatus.POSTED };

      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(draftTx);
      (prisma.txLog.update as jest.Mock).mockResolvedValue(postedTx);

      const result = await repository.updateStatus(mockTxLog.id, TxStatus.POSTED);

      expect(prisma.txLog.update).toHaveBeenCalledWith({
        where: { id: mockTxLog.id },
        data: { txStatus: TxStatus.POSTED },
      });
      expect(result.txStatus).toBe(TxStatus.POSTED);
    });

    it('should allow POSTED → VOIDED transition', async () => {
      const postedTx = { ...mockTxLog, txStatus: TxStatus.POSTED };
      const voidedTx = { ...mockTxLog, txStatus: TxStatus.VOIDED };

      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(postedTx);
      (prisma.txLog.update as jest.Mock).mockResolvedValue(voidedTx);

      const result = await repository.updateStatus(mockTxLog.id, TxStatus.VOIDED);

      expect(prisma.txLog.update).toHaveBeenCalledWith({
        where: { id: mockTxLog.id },
        data: { txStatus: TxStatus.VOIDED },
      });
      expect(result.txStatus).toBe(TxStatus.VOIDED);
    });

    it('should throw ImmutableTxException for POSTED → DRAFT (invalid)', async () => {
      const postedTx = { ...mockTxLog, txStatus: TxStatus.POSTED };
      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(postedTx);

      await expect(
        repository.updateStatus(mockTxLog.id, TxStatus.DRAFT),
      ).rejects.toThrow(ImmutableTxException);
    });

    it('should throw ImmutableTxException for VOIDED → any (invalid)', async () => {
      const voidedTx = { ...mockTxLog, txStatus: TxStatus.VOIDED };
      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(voidedTx);

      await expect(
        repository.updateStatus(mockTxLog.id, TxStatus.POSTED),
      ).rejects.toThrow(ImmutableTxException);

      await expect(
        repository.updateStatus(mockTxLog.id, TxStatus.DRAFT),
      ).rejects.toThrow(ImmutableTxException);
    });

    it('should throw ImmutableTxException for DRAFT → VOIDED (invalid)', async () => {
      const draftTx = { ...mockTxLog, txStatus: TxStatus.DRAFT };
      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(draftTx);

      await expect(
        repository.updateStatus(mockTxLog.id, TxStatus.VOIDED),
      ).rejects.toThrow(ImmutableTxException);
    });

    it('should throw error when TX not found', async () => {
      (prisma.txLog.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        repository.updateStatus('non-existent-id', TxStatus.POSTED),
      ).rejects.toThrow('Transaction non-existent-id not found');
    });
  });
});
