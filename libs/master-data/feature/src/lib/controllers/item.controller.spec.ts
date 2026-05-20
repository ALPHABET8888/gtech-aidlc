import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ItemController } from './item.controller';
import { ItemService } from '../services/item.service';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';

describe('ItemController', () => {
  let controller: ItemController;
  let service: jest.Mocked<ItemService>;

  const mockItem = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    code: 'ITM-001',
    name: 'น้ำมันเครื่อง 10W-40',
    unit: 'ลิตร',
    category: 'น้ำมันหล่อลื่น',
    isActive: true,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ItemController],
      providers: [
        {
          provide: ItemService,
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

    controller = module.get<ItemController>(ItemController);
    service = module.get(ItemService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /items (create)', () => {
    const dto: CreateItemDto = {
      code: 'ITM-001',
      name: 'น้ำมันเครื่อง 10W-40',
      unit: 'ลิตร',
      category: 'น้ำมันหล่อลื่น',
    };

    it('should create and return the new item', async () => {
      service.create.mockResolvedValue(mockItem);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockItem);
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException("Item with code 'ITM-001' already exists"),
      );

      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('GET /items (findAll)', () => {
    const mockPaginatedResult = {
      data: [mockItem],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated items with default pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith(
        { code: undefined, name: undefined, category: undefined, isActive: undefined },
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass filters and custom pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const query = {
        code: 'ITM',
        name: 'น้ำมัน',
        category: 'หล่อลื่น',
        isActive: true,
        page: 2,
        pageSize: 10,
      };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(
        { code: 'ITM', name: 'น้ำมัน', category: 'หล่อลื่น', isActive: true },
        { page: 2, pageSize: 10 },
      );
    });
  });

  describe('GET /items/:id (findById)', () => {
    it('should return item by ID', async () => {
      service.findById.mockResolvedValue(mockItem);

      const result = await controller.findById(mockItem.id);

      expect(service.findById).toHaveBeenCalledWith(mockItem.id);
      expect(result).toEqual(mockItem);
    });

    it('should propagate NotFoundException', async () => {
      service.findById.mockRejectedValue(
        new NotFoundException("Item with ID '...' not found"),
      );

      await expect(
        controller.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /items/:id (update)', () => {
    const dto: UpdateItemDto = { name: 'Updated Name' };

    it('should update and return the item', async () => {
      const updatedItem = { ...mockItem, name: 'Updated Name' };
      service.update.mockResolvedValue(updatedItem);

      const result = await controller.update(mockItem.id, dto);

      expect(service.update).toHaveBeenCalledWith(mockItem.id, dto);
      expect(result.name).toBe('Updated Name');
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
        controller.update(mockItem.id, { code: 'EXISTING' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /items/:id (delete)', () => {
    it('should soft-delete and return the deactivated item', async () => {
      const deletedItem = { ...mockItem, isActive: false };
      service.delete.mockResolvedValue(deletedItem);

      const result = await controller.delete(mockItem.id);

      expect(service.delete).toHaveBeenCalledWith(mockItem.id);
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
