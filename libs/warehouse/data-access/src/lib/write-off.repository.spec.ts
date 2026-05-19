import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@autoflow/shared-prisma';
import { WriteOffRepository } from './write-off.repository';
import { WriteOffStatus } from '@prisma/client';

describe('WriteOffRepository', () => {
  let repository: WriteOffRepository;
  let prisma: jest.Mocked<any>;

  const mockWriteOff = {
    id: '11111111-1111-1111-1111-111111111111',
    warehouseId: '22222222-2222-2222-2222-222222222222',
    itemId: '33333333-3333-3333-3333-333333333333',
    qty: 5,
    unitCost: 100,
    totalLoss: 500,
    salvageValue: 0,
    reason: 'Damaged goods',
    status: WriteOffStatus.PENDING_APPROVAL,
    requestedBy: '44444444-4444-4444-4444-444444444444',
    approvedBy: null,
    approvedAt: null,
    txId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEvidence = {
    id: '55555555-5555-5555-5555-555555555555',
    writeOffId: mockWriteOff.id,
    fileName: 'damage-photo.jpg',
    filePath: '/uploads/damage-photo.jpg',
    fileSize: 1024000,
    mimeType: 'image/jpeg',
    uploadedBy: '44444444-4444-4444-4444-444444444444',
    uploadedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      writeOffRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      writeOffEvidence: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WriteOffRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get<WriteOffRepository>(WriteOffRepository);
  });

  describe('create', () => {
    it('should create a write-off request with PENDING_APPROVAL status', async () => {
      prisma.writeOffRequest.create.mockResolvedValue(mockWriteOff);

      const result = await repository.create({
        warehouseId: mockWriteOff.warehouseId,
        itemId: mockWriteOff.itemId,
        qty: mockWriteOff.qty,
        unitCost: mockWriteOff.unitCost,
        totalLoss: mockWriteOff.totalLoss,
        reason: mockWriteOff.reason,
        requestedBy: mockWriteOff.requestedBy,
      });

      expect(result).toEqual(mockWriteOff);
      expect(prisma.writeOffRequest.create).toHaveBeenCalledWith({
        data: {
          warehouseId: mockWriteOff.warehouseId,
          itemId: mockWriteOff.itemId,
          qty: mockWriteOff.qty,
          unitCost: mockWriteOff.unitCost,
          totalLoss: mockWriteOff.totalLoss,
          salvageValue: 0,
          reason: mockWriteOff.reason,
          requestedBy: mockWriteOff.requestedBy,
          status: WriteOffStatus.PENDING_APPROVAL,
        },
      });
    });

    it('should create with salvage value when provided', async () => {
      const withSalvage = { ...mockWriteOff, salvageValue: 50 };
      prisma.writeOffRequest.create.mockResolvedValue(withSalvage);

      const result = await repository.create({
        warehouseId: mockWriteOff.warehouseId,
        itemId: mockWriteOff.itemId,
        qty: mockWriteOff.qty,
        unitCost: mockWriteOff.unitCost,
        totalLoss: mockWriteOff.totalLoss,
        salvageValue: 50,
        reason: mockWriteOff.reason,
        requestedBy: mockWriteOff.requestedBy,
      });

      expect(result.salvageValue).toBe(50);
    });
  });

  describe('findById', () => {
    it('should return write-off with evidence', async () => {
      const withEvidence = { ...mockWriteOff, evidence: [mockEvidence] };
      prisma.writeOffRequest.findUnique.mockResolvedValue(withEvidence);

      const result = await repository.findById(mockWriteOff.id);

      expect(result).toEqual(withEvidence);
      expect(prisma.writeOffRequest.findUnique).toHaveBeenCalledWith({
        where: { id: mockWriteOff.id },
        include: { evidence: true },
      });
    });

    it('should return null when write-off not found', async () => {
      prisma.writeOffRequest.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByWarehouseAndStatus', () => {
    it('should query with warehouse and status filters', async () => {
      prisma.$transaction.mockResolvedValue([[mockWriteOff], 1]);

      const result = await repository.findByWarehouseAndStatus({
        warehouseId: mockWriteOff.warehouseId,
        status: WriteOffStatus.PENDING_APPROVAL,
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({ data: [mockWriteOff], total: 1 });
    });

    it('should use default pagination when not provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await repository.findByWarehouseAndStatus({});

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update write-off status to APPROVED', async () => {
      const approvedAt = new Date();
      const updated = { ...mockWriteOff, status: WriteOffStatus.APPROVED, approvedBy: 'cfo-1', approvedAt };
      prisma.writeOffRequest.update.mockResolvedValue(updated);

      const result = await repository.updateStatus(
        mockWriteOff.id,
        WriteOffStatus.APPROVED,
        { approvedBy: 'cfo-1', approvedAt },
      );

      expect(result.status).toBe(WriteOffStatus.APPROVED);
      expect(result.approvedBy).toBe('cfo-1');
    });

    it('should update status to POSTED with txId', async () => {
      const updated = { ...mockWriteOff, status: WriteOffStatus.POSTED, txId: 'tx-123' };
      prisma.writeOffRequest.update.mockResolvedValue(updated);

      const result = await repository.updateStatus(
        mockWriteOff.id,
        WriteOffStatus.POSTED,
        { txId: 'tx-123' },
      );

      expect(result.status).toBe(WriteOffStatus.POSTED);
      expect(result.txId).toBe('tx-123');
    });
  });

  describe('createEvidence', () => {
    it('should create evidence record', async () => {
      prisma.writeOffEvidence.create.mockResolvedValue(mockEvidence);

      const result = await repository.createEvidence({
        writeOffId: mockWriteOff.id,
        fileName: 'damage-photo.jpg',
        filePath: '/uploads/damage-photo.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        uploadedBy: '44444444-4444-4444-4444-444444444444',
      });

      expect(result).toEqual(mockEvidence);
    });
  });

  describe('countEvidenceByWriteOffId', () => {
    it('should return evidence count', async () => {
      prisma.writeOffEvidence.count.mockResolvedValue(2);

      const result = await repository.countEvidenceByWriteOffId(mockWriteOff.id);

      expect(result).toBe(2);
      expect(prisma.writeOffEvidence.count).toHaveBeenCalledWith({
        where: { writeOffId: mockWriteOff.id },
      });
    });
  });
});
