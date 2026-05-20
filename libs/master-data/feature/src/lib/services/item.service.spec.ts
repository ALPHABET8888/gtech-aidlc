import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ItemService } from './item.service';
import { ItemRepository } from '@autoflow/master-data-data-access';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';

describe('ItemService', () => {
  let service: ItemService;
  let repository: jest.Mocked<ItemRepository>;

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
      providers: [
        ItemService,
        {
          provide: ItemRepository,
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

    service = module.get<ItemService>(ItemService);
    repository = module.get(ItemRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateItemDto = {
      code: 'ITM-001',
      name: 'น้ำมันเครื่อง 10W-40',
      unit: 'ลิตร',
      category: 'น้ำมันหล่อลื่น',
    };

    it('should create a new item successfully', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockItem);

      const result = await service.create(dto);

      expect(repository.findByCode).toHaveBeenCalledWith('ITM-001');
      expect(repository.create).toHaveBeenCalledWith({
        code: 'ITM-001',
        name: 'น้ำมันเครื่อง 10W-40',
        unit: 'ลิตร',
        category: 'น้ำมันหล่อลื่น',
        isActive: true,
      });
      expect(result).toEqual(mockItem);
    });

    it('should throw ConflictException if code already exists', async () => {
      repository.findByCode.mockResolvedValue(mockItem);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should default isActive to true when not provided', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockItem);

      await service.create({ code: 'ITM-002', name: 'Test', unit: 'pcs' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should allow setting isActive to false on creation', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...mockItem, isActive: false });

      await service.create({ ...dto, isActive: false });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('findAll', () => {
    const mockPaginatedResult = {
      data: [mockItem],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated items with default pagination', async () => {
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

      const filters = { code: 'ITM', category: 'น้ำมัน', isActive: true };
      const pagination = { page: 2, pageSize: 10 };

      await service.findAll(filters, pagination);

      expect(repository.findMany).toHaveBeenCalledWith(filters, pagination);
    });
  });

  describe('findById', () => {
    it('should return item when found', async () => {
      repository.findById.mockResolvedValue(mockItem);

      const result = await service.findById(mockItem.id);

      expect(repository.findById).toHaveBeenCalledWith(mockItem.id);
      expect(result).toEqual(mockItem);
    });

    it('should throw NotFoundException when item not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const dto: UpdateItemDto = {
      name: 'น้ำมันเครื่อง 5W-30',
    };

    it('should update an existing item', async () => {
      const updatedItem = { ...mockItem, name: 'น้ำมันเครื่อง 5W-30' };
      repository.findById.mockResolvedValue(mockItem);
      repository.update.mockResolvedValue(updatedItem);

      const result = await service.update(mockItem.id, dto);

      expect(repository.update).toHaveBeenCalledWith(mockItem.id, {
        name: 'น้ำมันเครื่อง 5W-30',
      });
      expect(result).toEqual(updatedItem);
    });

    it('should throw NotFoundException if item does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('550e8400-e29b-41d4-a716-446655440099', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new code already exists', async () => {
      const anotherItem = { ...mockItem, id: 'other-id', code: 'ITM-999' };
      repository.findById.mockResolvedValue(mockItem);
      repository.findByCode.mockResolvedValue(anotherItem);

      await expect(
        service.update(mockItem.id, { code: 'ITM-999' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same code without conflict', async () => {
      repository.findById.mockResolvedValue(mockItem);
      repository.update.mockResolvedValue(mockItem);

      // Updating with the same code should not trigger uniqueness check
      await service.update(mockItem.id, { code: 'ITM-001' });

      expect(repository.findByCode).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft-delete an item', async () => {
      const deletedItem = { ...mockItem, isActive: false };
      repository.findById.mockResolvedValue(mockItem);
      repository.softDelete.mockResolvedValue(deletedItem);

      const result = await service.delete(mockItem.id);

      expect(repository.softDelete).toHaveBeenCalledWith(mockItem.id);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if item does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.delete('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
