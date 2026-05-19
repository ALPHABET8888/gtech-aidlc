import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@autoflow/shared-prisma';
import { TransferOrderRepository } from './transfer-order.repository';
import { TransferStatus } from '@prisma/client';

describe('TransferOrderRepository', () => {
  let repository: TransferOrderRepository;
  let prisma: jest.Mocked<any>;

  const mockTransfer = {
    id: '11111111-1111-1111-1111-111111111111',
    sourceWarehouseId: '22222222-2222-2222-2222-222222222222',
    destWarehouseId: '33333333-3333-3333-3333-333333333333',
    status: TransferStatus.DRAFT,
    initiatedBy: '44444444-4444-4444-4444-444444444444',
    postedAt: null,
    notes: 'Test transfer',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLine = {
    id: '55555555-5555-5555-5555-555555555555',
    transferId: mockTransfer.id,
    itemId: '66666666-6666-6666-6666-666666666666',
    qty: 10,
    unitCost: 100,
    txId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      transferOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      transferLine: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferOrderRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get<TransferOrderRepository>(TransferOrderRepository);
  });

  describe('create', () => {
    it('should create a transfer order with DRAFT status', async () => {
      prisma.transferOrder.create.mockResolvedValue(mockTransfer);

      const result = await repository.create({
        sourceWarehouseId: mockTransfer.sourceWarehouseId,
        destWarehouseId: mockTransfer.destWarehouseId,
        initiatedBy: mockTransfer.initiatedBy,
        notes: 'Test transfer',
      });

      expect(result).toEqual(mockTransfer);
      expect(prisma.transferOrder.create).toHaveBeenCalledWith({
        data: {
          sourceWarehouseId: mockTransfer.sourceWarehouseId,
          destWarehouseId: mockTransfer.destWarehouseId,
          initiatedBy: mockTransfer.initiatedBy,
          notes: 'Test transfer',
          status: TransferStatus.DRAFT,
        },
      });
    });
  });

  describe('findById', () => {
    it('should return transfer with lines', async () => {
      const transferWithLines = { ...mockTransfer, lines: [mockLine] };
      prisma.transferOrder.findUnique.mockResolvedValue(transferWithLines);

      const result = await repository.findById(mockTransfer.id);

      expect(result).toEqual(transferWithLines);
      expect(prisma.transferOrder.findUnique).toHaveBeenCalledWith({
        where: { id: mockTransfer.id },
        include: { lines: true },
      });
    });

    it('should return null when transfer not found', async () => {
      prisma.transferOrder.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findBySourceOrDestWarehouse', () => {
    it('should query with source warehouse filter', async () => {
      prisma.$transaction.mockResolvedValue([[mockTransfer], 1]);

      const result = await repository.findBySourceOrDestWarehouse({
        sourceWarehouseId: mockTransfer.sourceWarehouseId,
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({ data: [mockTransfer], total: 1 });
    });

    it('should query with dest warehouse filter', async () => {
      prisma.$transaction.mockResolvedValue([[mockTransfer], 1]);

      const result = await repository.findBySourceOrDestWarehouse({
        destWarehouseId: mockTransfer.destWarehouseId,
      });

      expect(result).toEqual({ data: [mockTransfer], total: 1 });
    });
  });

  describe('updateStatus', () => {
    it('should update transfer status to POSTED with postedAt', async () => {
      const postedAt = new Date();
      const updated = { ...mockTransfer, status: TransferStatus.POSTED, postedAt };
      prisma.transferOrder.update.mockResolvedValue(updated);

      const result = await repository.updateStatus(
        mockTransfer.id,
        TransferStatus.POSTED,
        { postedAt },
      );

      expect(result.status).toBe(TransferStatus.POSTED);
      expect(result.postedAt).toBe(postedAt);
    });
  });

  describe('createLines', () => {
    it('should batch create transfer lines', async () => {
      prisma.transferLine.createMany.mockResolvedValue({ count: 2 });

      const result = await repository.createLines([
        { transferId: mockTransfer.id, itemId: 'item-1', qty: 10, unitCost: 100 },
        { transferId: mockTransfer.id, itemId: 'item-2', qty: 5, unitCost: 200 },
      ]);

      expect(result.count).toBe(2);
    });
  });

  describe('updateLinesTxId', () => {
    it('should update all lines with tx_id', async () => {
      prisma.transferLine.updateMany.mockResolvedValue({ count: 2 });

      const result = await repository.updateLinesTxId(mockTransfer.id, 'tx-123');

      expect(result.count).toBe(2);
      expect(prisma.transferLine.updateMany).toHaveBeenCalledWith({
        where: { transferId: mockTransfer.id },
        data: { txId: 'tx-123' },
      });
    });
  });
});
