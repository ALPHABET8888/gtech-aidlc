import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@autoflow/shared-prisma';
import { CountSessionRepository } from './count-session.repository';
import { CountSessionStatus } from '@prisma/client';

describe('CountSessionRepository', () => {
  let repository: CountSessionRepository;
  let prisma: jest.Mocked<any>;

  const mockSession = {
    id: '11111111-1111-1111-1111-111111111111',
    warehouseId: '22222222-2222-2222-2222-222222222222',
    status: CountSessionStatus.INITIATED,
    initiatedBy: '33333333-3333-3333-3333-333333333333',
    initiatedAt: new Date(),
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    notes: 'Test session',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLine = {
    id: '44444444-4444-4444-4444-444444444444',
    sessionId: mockSession.id,
    itemId: '55555555-5555-5555-5555-555555555555',
    systemQty: 100,
    physicalQty: null,
    difference: null,
    systemMa: 50,
    isFrozen: true,
    reasonCode: null,
    txId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      countSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      countLine: {
        create: jest.fn(),
        createMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountSessionRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get<CountSessionRepository>(CountSessionRepository);
  });

  describe('create', () => {
    it('should create a count session with INITIATED status', async () => {
      prisma.countSession.create.mockResolvedValue(mockSession);

      const result = await repository.create({
        warehouseId: mockSession.warehouseId,
        initiatedBy: mockSession.initiatedBy,
        notes: 'Test session',
      });

      expect(result).toEqual(mockSession);
      expect(prisma.countSession.create).toHaveBeenCalledWith({
        data: {
          warehouseId: mockSession.warehouseId,
          initiatedBy: mockSession.initiatedBy,
          notes: 'Test session',
          status: CountSessionStatus.INITIATED,
        },
      });
    });
  });

  describe('findById', () => {
    it('should return session with lines', async () => {
      const sessionWithLines = { ...mockSession, lines: [mockLine] };
      prisma.countSession.findUnique.mockResolvedValue(sessionWithLines);

      const result = await repository.findById(mockSession.id);

      expect(result).toEqual(sessionWithLines);
      expect(prisma.countSession.findUnique).toHaveBeenCalledWith({
        where: { id: mockSession.id },
        include: { lines: true },
      });
    });

    it('should return null when session not found', async () => {
      prisma.countSession.findUnique.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByWarehouseAndStatus', () => {
    it('should query with warehouse and status filters', async () => {
      prisma.$transaction.mockResolvedValue([[mockSession], 1]);

      const result = await repository.findByWarehouseAndStatus({
        warehouseId: mockSession.warehouseId,
        status: CountSessionStatus.INITIATED,
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({ data: [mockSession], total: 1 });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should use default pagination when not provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await repository.findByWarehouseAndStatus({});

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update session status', async () => {
      const updated = { ...mockSession, status: CountSessionStatus.COUNTING };
      prisma.countSession.update.mockResolvedValue(updated);

      const result = await repository.updateStatus(mockSession.id, CountSessionStatus.COUNTING);

      expect(result.status).toBe(CountSessionStatus.COUNTING);
      expect(prisma.countSession.update).toHaveBeenCalledWith({
        where: { id: mockSession.id },
        data: { status: CountSessionStatus.COUNTING },
      });
    });

    it('should update status with additional data', async () => {
      const approvedAt = new Date();
      const updated = { ...mockSession, status: CountSessionStatus.APPROVED, approvedBy: 'user-1', approvedAt };
      prisma.countSession.update.mockResolvedValue(updated);

      const result = await repository.updateStatus(
        mockSession.id,
        CountSessionStatus.APPROVED,
        { approvedBy: 'user-1', approvedAt },
      );

      expect(result.status).toBe(CountSessionStatus.APPROVED);
    });
  });

  describe('createLines', () => {
    it('should batch create count lines', async () => {
      prisma.countLine.createMany.mockResolvedValue({ count: 2 });

      const result = await repository.createLines([
        { sessionId: mockSession.id, itemId: 'item-1', systemQty: 100, systemMa: 50 },
        { sessionId: mockSession.id, itemId: 'item-2', systemQty: 200, systemMa: 75 },
      ]);

      expect(result.count).toBe(2);
    });
  });

  describe('updateLine', () => {
    it('should update a count line with physical qty and difference', async () => {
      const updatedLine = { ...mockLine, physicalQty: 95, difference: -5 };
      prisma.countLine.update.mockResolvedValue(updatedLine);

      const result = await repository.updateLine(mockLine.id, {
        physicalQty: 95,
        difference: -5,
      });

      expect(result.physicalQty).toBe(95);
      expect(result.difference).toBe(-5);
    });
  });

  describe('findFrozenLinesByItem', () => {
    it('should find frozen lines for a given item', async () => {
      prisma.countLine.findMany.mockResolvedValue([mockLine]);

      const result = await repository.findFrozenLinesByItem(mockLine.itemId);

      expect(result).toEqual([mockLine]);
      expect(prisma.countLine.findMany).toHaveBeenCalledWith({
        where: { itemId: mockLine.itemId, isFrozen: true },
      });
    });
  });
});
