import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { VendorController } from './vendor.controller';
import { VendorService } from '../services/vendor.service';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';

describe('VendorController', () => {
  let controller: VendorController;
  let service: jest.Mocked<VendorService>;

  const mockVendor = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    code: 'VND-001',
    name: 'บริษัท สยามซัพพลาย จำกัด',
    taxId: '0105556012345',
    address: '123 ถ.สุขุมวิท กรุงเทพฯ 10110',
    phone: '02-123-4567',
    email: 'contact@siamsupply.co.th',
    isActive: true,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorController],
      providers: [
        {
          provide: VendorService,
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

    controller = module.get<VendorController>(VendorController);
    service = module.get(VendorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /vendors (create)', () => {
    const dto: CreateVendorDto = {
      code: 'VND-001',
      name: 'บริษัท สยามซัพพลาย จำกัด',
      phone: '02-123-4567',
      email: 'contact@siamsupply.co.th',
      address: '123 ถ.สุขุมวิท กรุงเทพฯ 10110',
      taxId: '0105556012345',
    };

    it('should create and return the new vendor', async () => {
      service.create.mockResolvedValue(mockVendor);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockVendor);
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException("Vendor with code 'VND-001' already exists"),
      );

      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('GET /vendors (findAll)', () => {
    const mockPaginatedResult = {
      data: [mockVendor],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated vendors with default pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith(
        { code: undefined, name: undefined, isActive: undefined },
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass filters and custom pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const query = {
        code: 'VND',
        name: 'สยาม',
        isActive: true,
        page: 2,
        pageSize: 10,
      };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(
        { code: 'VND', name: 'สยาม', isActive: true },
        { page: 2, pageSize: 10 },
      );
    });
  });

  describe('GET /vendors/:id (findById)', () => {
    it('should return vendor by ID', async () => {
      service.findById.mockResolvedValue(mockVendor);

      const result = await controller.findById(mockVendor.id);

      expect(service.findById).toHaveBeenCalledWith(mockVendor.id);
      expect(result).toEqual(mockVendor);
    });

    it('should propagate NotFoundException', async () => {
      service.findById.mockRejectedValue(
        new NotFoundException("Vendor with ID '...' not found"),
      );

      await expect(
        controller.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /vendors/:id (update)', () => {
    const dto: UpdateVendorDto = { name: 'Updated Vendor Name' };

    it('should update and return the vendor', async () => {
      const updatedVendor = { ...mockVendor, name: 'Updated Vendor Name' };
      service.update.mockResolvedValue(updatedVendor);

      const result = await controller.update(mockVendor.id, dto);

      expect(service.update).toHaveBeenCalledWith(mockVendor.id, dto);
      expect(result.name).toBe('Updated Vendor Name');
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
        controller.update(mockVendor.id, { code: 'EXISTING' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /vendors/:id (delete)', () => {
    it('should soft-delete and return the deactivated vendor', async () => {
      const deletedVendor = { ...mockVendor, isActive: false };
      service.delete.mockResolvedValue(deletedVendor);

      const result = await controller.delete(mockVendor.id);

      expect(service.delete).toHaveBeenCalledWith(mockVendor.id);
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
