import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from '../services/warehouse.service';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';

describe('WarehouseController', () => {
  let controller: WarehouseController;
  let service: jest.Mocked<WarehouseService>;

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
      controllers: [WarehouseController],
      providers: [
        {
          provide: WarehouseService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WarehouseController>(WarehouseController);
    service = module.get(WarehouseService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /warehouses (create)', () => {
    const dto: CreateWarehouseDto = {
      code: 'WH-001',
      name: 'คลังสินค้าหลัก',
      location: 'อาคาร A ชั้น 1',
    };

    it('should create and return the new warehouse', async () => {
      service.create.mockResolvedValue(mockWarehouse);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockWarehouse);
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException("Warehouse with code 'WH-001' already exists"),
      );

      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('GET /warehouses (findAll)', () => {
    const mockPaginatedResult = {
      data: [mockWarehouse],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated warehouses with default pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith(
        { code: undefined, name: undefined, location: undefined, isActive: undefined },
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass filters and custom pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const query = {
        code: 'WH',
        name: 'คลัง',
        location: 'อาคาร',
        isActive: true,
        page: 2,
        pageSize: 10,
      };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(
        { code: 'WH', name: 'คลัง', location: 'อาคาร', isActive: true },
        { page: 2, pageSize: 10 },
      );
    });
  });

  describe('GET /warehouses/:id (findById)', () => {
    it('should return warehouse by ID', async () => {
      service.findById.mockResolvedValue(mockWarehouse);

      const result = await controller.findById(mockWarehouse.id);

      expect(service.findById).toHaveBeenCalledWith(mockWarehouse.id);
      expect(result).toEqual(mockWarehouse);
    });

    it('should propagate NotFoundException', async () => {
      service.findById.mockRejectedValue(
        new NotFoundException("Warehouse with ID '...' not found"),
      );

      await expect(
        controller.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /warehouses/:id (update)', () => {
    const dto: UpdateWarehouseDto = { name: 'Updated Warehouse' };

    it('should update and return the warehouse', async () => {
      const updatedWarehouse = { ...mockWarehouse, name: 'Updated Warehouse' };
      service.update.mockResolvedValue(updatedWarehouse);

      const result = await controller.update(mockWarehouse.id, dto);

      expect(service.update).toHaveBeenCalledWith(mockWarehouse.id, dto);
      expect(result.name).toBe('Updated Warehouse');
    });

    it('should propagate NotFoundException', async () => {
      service.update.mockRejectedValue(new NotFoundException());

      await expect(
        controller.update('550e8400-e29b-41d4-a716-446655440099', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ConflictException for duplicate code', async () => {
      service.update.mockRejectedValue(new ConflictException());

      await expect(
        controller.update(mockWarehouse.id, { code: 'EXISTING' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /warehouses/:id (delete)', () => {
    it('should soft-delete and return the deactivated warehouse', async () => {
      const deletedWarehouse = { ...mockWarehouse, isActive: false };
      service.delete.mockResolvedValue(deletedWarehouse);

      const result = await controller.delete(mockWarehouse.id);

      expect(service.delete).toHaveBeenCalledWith(mockWarehouse.id);
      expect(result.isActive).toBe(false);
    });

    it('should propagate NotFoundException', async () => {
      service.delete.mockRejectedValue(new NotFoundException());

      await expect(
        controller.delete('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
