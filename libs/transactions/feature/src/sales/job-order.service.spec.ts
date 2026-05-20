import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JobOrderService } from './job-order.service';
import { JobOrderRepository } from '@autoflow/transactions-data-access';
import { CreateJobOrderDto, UpdateJoStatusDto, JOStatus } from '../dto';
import { JobOrder, JOStatus as PrismaJOStatus } from '@prisma/client';

describe('JobOrderService', () => {
  let service: JobOrderService;
  let repository: jest.Mocked<JobOrderRepository>;

  const mockJobOrder = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    joNumber: 'JO-202501-0001',
    customerId: '660e8400-e29b-41d4-a716-446655440000',
    status: PrismaJOStatus.OPEN,
    hasTempDo: false,
    tempDoId: null,
    invoiceId: null,
    items: [{ itemId: '770e8400-e29b-41d4-a716-446655440000', qty: 5, unitPrice: 100, description: 'Test item' }],
    totalAmount: '500.00',
    vatAmount: '35.00',
    grandTotal: '535.00',
    notes: null,
    createdBy: '880e8400-e29b-41d4-a716-446655440000',
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  } as unknown as JobOrder;

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByJoNumber: jest.fn(),
      findMany: jest.fn(),
      updateStatus: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobOrderService,
        { provide: JobOrderRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<JobOrderService>(JobOrderService);
    repository = module.get(JobOrderRepository);
  });

  describe('createJobOrder', () => {
    it('should create a job order with calculated amounts', async () => {
      const dto: CreateJobOrderDto = {
        customerId: '660e8400-e29b-41d4-a716-446655440000',
        items: [
          { itemId: '770e8400-e29b-41d4-a716-446655440000', qty: 5, unitPrice: 100, description: 'Test item' },
        ],
        notes: 'Test notes',
      };

      repository.create.mockResolvedValue(mockJobOrder);

      const result = await service.createJobOrder(dto, '880e8400-e29b-41d4-a716-446655440000');

      expect(result).toEqual(mockJobOrder);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: dto.customerId,
          status: PrismaJOStatus.OPEN,
          hasTempDo: false,
          totalAmount: '500.00',
          vatAmount: '35.00',
          grandTotal: '535.00',
          notes: 'Test notes',
          createdBy: '880e8400-e29b-41d4-a716-446655440000',
        }),
      );
    });

    it('should generate a JO number with correct format', async () => {
      repository.create.mockResolvedValue(mockJobOrder);

      const dto: CreateJobOrderDto = {
        customerId: '660e8400-e29b-41d4-a716-446655440000',
        items: [{ itemId: '770e8400-e29b-41d4-a716-446655440000', qty: 1, unitPrice: 50 }],
      };

      await service.createJobOrder(dto, '880e8400-e29b-41d4-a716-446655440000');

      const createCall = repository.create.mock.calls[0][0];
      expect(createCall.joNumber).toMatch(/^JO-\d{6}-\d{4}$/);
    });

    it('should set notes to null when not provided', async () => {
      repository.create.mockResolvedValue(mockJobOrder);

      const dto: CreateJobOrderDto = {
        customerId: '660e8400-e29b-41d4-a716-446655440000',
        items: [{ itemId: '770e8400-e29b-41d4-a716-446655440000', qty: 1, unitPrice: 50 }],
      };

      await service.createJobOrder(dto, '880e8400-e29b-41d4-a716-446655440000');

      const createCall = repository.create.mock.calls[0][0];
      expect(createCall.notes).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should allow OPEN → IN_PROGRESS transition', async () => {
      const openJo = { ...mockJobOrder, status: PrismaJOStatus.OPEN };
      const updatedJo = { ...mockJobOrder, status: PrismaJOStatus.IN_PROGRESS };

      repository.findById.mockResolvedValue(openJo);
      repository.updateStatus.mockResolvedValue(updatedJo);

      const dto: UpdateJoStatusDto = { status: JOStatus.IN_PROGRESS };
      const result = await service.updateStatus(mockJobOrder.id, dto);

      expect(result.status).toBe(PrismaJOStatus.IN_PROGRESS);
      expect(repository.updateStatus).toHaveBeenCalledWith(mockJobOrder.id, PrismaJOStatus.IN_PROGRESS);
    });

    it('should allow IN_PROGRESS → DONE transition', async () => {
      const inProgressJo = { ...mockJobOrder, status: PrismaJOStatus.IN_PROGRESS };
      const doneJo = { ...mockJobOrder, status: PrismaJOStatus.DONE };

      repository.findById.mockResolvedValue(inProgressJo);
      repository.updateStatus.mockResolvedValue(doneJo);

      const dto: UpdateJoStatusDto = { status: JOStatus.DONE };
      const result = await service.updateStatus(mockJobOrder.id, dto);

      expect(result.status).toBe(PrismaJOStatus.DONE);
    });

    it('should reject OPEN → DONE (skip not allowed)', async () => {
      const openJo = { ...mockJobOrder, status: PrismaJOStatus.OPEN };
      repository.findById.mockResolvedValue(openJo);

      const dto: UpdateJoStatusDto = { status: JOStatus.DONE };

      await expect(service.updateStatus(mockJobOrder.id, dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject IN_PROGRESS → OPEN (reverse not allowed)', async () => {
      const inProgressJo = { ...mockJobOrder, status: PrismaJOStatus.IN_PROGRESS };
      repository.findById.mockResolvedValue(inProgressJo);

      const dto: UpdateJoStatusDto = { status: JOStatus.OPEN };

      await expect(service.updateStatus(mockJobOrder.id, dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject DONE → any (terminal state)', async () => {
      const doneJo = { ...mockJobOrder, status: PrismaJOStatus.DONE };
      repository.findById.mockResolvedValue(doneJo);

      const dto: UpdateJoStatusDto = { status: JOStatus.OPEN };

      await expect(service.updateStatus(mockJobOrder.id, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when JO not found', async () => {
      repository.findById.mockResolvedValue(null);

      const dto: UpdateJoStatusDto = { status: JOStatus.IN_PROGRESS };

      await expect(service.updateStatus('non-existent-id', dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should return the job order when found', async () => {
      repository.findById.mockResolvedValue(mockJobOrder);

      const result = await service.findById(mockJobOrder.id);

      expect(result).toEqual(mockJobOrder);
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findMany', () => {
    it('should return paginated results', async () => {
      const mockData = [mockJobOrder];
      repository.findMany.mockResolvedValue({ data: mockData, total: 1 });

      const result = await service.findMany({ page: 1, limit: 20 });

      expect(result.data).toEqual(mockData);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should pass filter options to repository', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.findMany({
        status: PrismaJOStatus.OPEN,
        customerId: '660e8400-e29b-41d4-a716-446655440000',
        page: 2,
        limit: 10,
      });

      expect(repository.findMany).toHaveBeenCalledWith({
        status: PrismaJOStatus.OPEN,
        customerId: '660e8400-e29b-41d4-a716-446655440000',
        page: 2,
        limit: 10,
      });
    });

    it('should calculate totalPages correctly', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 45 });

      const result = await service.findMany({ page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
    });
  });
});
