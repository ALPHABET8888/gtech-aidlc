import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { WarehouseRepository } from '@autoflow/master-data-data-access';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let repository: jest.Mocked<WarehouseRepository>;

  const mockWarehouse = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    code: 'WH-001',
    name: 'คลังสินค้าหลัก',
    location: 'อาคาร A ชั้น 1',
    isActive: true,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        {
          provide: WarehouseRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findByCode: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
    repository = module.get(WarehouseRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateWarehouseDto = {
      code: 'WH-001',
      name: 'คลังสินค้าหลัก',
      location: 'อาคาร A ชั้น 1',
    };

    it('should create a new warehouse successfully', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockWarehouse);

      const result = await service.create(dto);

      expect(repository.findByCode).toHaveBeenCalledWith('WH-001');
      expect(repository.create).toHaveBeenCalledWith({
        code: 'WH-001',
        name: 'คลังสินค้าหลัก',
        location: 'อาคาร A ชั้น 1',
        isActive: true,
      });
      expect(result).toEqual(mockWarehouse);
    });

    it('should throw ConflictException if code already exists', async () => {
      repository.findByCode.mockResolvedValue(mockWarehouse);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should default isActive to true when not provided', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockWarehouse);

      await service.create({ code: 'WH-002', name: 'คลัง 2' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should default location to null when not provided', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...mockWarehouse, location: null });

      await service.create({ code: 'WH-002', name: 'คลัง 2' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ location: null }),
      );
    });

    it('should allow setting isActive to false on creation', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...mockWarehouse, isActive: false });

      await service.create({ ...dto, isActive: false });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('findAll', () => {
    const mockPaginatedResult = {
      data: [mockWarehouse],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated warehouses with default pagination', async () => {
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

      const filters = { code: 'WH', location: 'อาคาร', isActive: true };
      const pagination = { page: 2, pageSize: 10 };

      await service.findAll(filters, pagination);

      expect(repository.findMany).toHaveBeenCalledWith(filters, pagination);
    });
  });

  describe('findById', () => {
    it('should return warehouse when found', async () => {
      repository.findById.mockResolvedValue(mockWarehouse);

      const result = await service.findById(mockWarehouse.id);

      expect(repository.findById).toHaveBeenCalledWith(mockWarehouse.id);
      expect(result).toEqual(mockWarehouse);
    });

    it('should throw NotFoundException when warehouse not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const dto: UpdateWarehouseDto = {
      name: 'คลังสินค้าหลัก (ปรับปรุง)',
    };

    it('should update an existing warehouse', async () => {
      const updatedWarehouse = { ...mockWarehouse, name: 'คลังสินค้าหลัก (ปรับปรุง)' };
      repository.findById.mockResolvedValue(mockWarehouse);
      repository.update.mockResolvedValue(updatedWarehouse);

      const result = await service.update(mockWarehouse.id, dto);

      expect(repository.update).toHaveBeenCalledWith(mockWarehouse.id, {
        name: 'คลังสินค้าหลัก (ปรับปรุง)',
      });
      expect(result).toEqual(updatedWarehouse);
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('550e8400-e29b-41d4-a716-446655440099', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new code already exists', async () => {
      const anotherWarehouse = { ...mockWarehouse, id: 'other-id', code: 'WH-999' };
      repository.findById.mockResolvedValue(mockWarehouse);
      repository.findByCode.mockResolvedValue(anotherWarehouse);

      await expect(
        service.update(mockWarehouse.id, { code: 'WH-999' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same code without conflict', async () => {
      repository.findById.mockResolvedValue(mockWarehouse);
      repository.update.mockResolvedValue(mockWarehouse);

      // Updating with the same code should not trigger uniqueness check
      await service.update(mockWarehouse.id, { code: 'WH-001' });

      expect(repository.findByCode).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft-delete a warehouse', async () => {
      const deletedWarehouse = { ...mockWarehouse, isActive: false };
      repository.findById.mockResolvedValue(mockWarehouse);
      repository.softDelete.mockResolvedValue(deletedWarehouse);

      const result = await service.delete(mockWarehouse.id);

      expect(repository.softDelete).toHaveBeenCalledWith(mockWarehouse.id);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.delete('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
