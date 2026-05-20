import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { VendorRepository } from '@autoflow/master-data-data-access';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';

describe('VendorService', () => {
  let service: VendorService;
  let repository: jest.Mocked<VendorRepository>;

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
      providers: [
        VendorService,
        {
          provide: VendorRepository,
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

    service = module.get<VendorService>(VendorService);
    repository = module.get(VendorRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateVendorDto = {
      code: 'VND-001',
      name: 'บริษัท สยามซัพพลาย จำกัด',
      phone: '02-123-4567',
      email: 'contact@siamsupply.co.th',
      address: '123 ถ.สุขุมวิท กรุงเทพฯ 10110',
      taxId: '0105556012345',
    };

    it('should create a new vendor successfully', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockVendor);

      const result = await service.create(dto);

      expect(repository.findByCode).toHaveBeenCalledWith('VND-001');
      expect(repository.create).toHaveBeenCalledWith({
        code: 'VND-001',
        name: 'บริษัท สยามซัพพลาย จำกัด',
        phone: '02-123-4567',
        email: 'contact@siamsupply.co.th',
        address: '123 ถ.สุขุมวิท กรุงเทพฯ 10110',
        taxId: '0105556012345',
        isActive: true,
      });
      expect(result).toEqual(mockVendor);
    });

    it('should throw ConflictException if code already exists', async () => {
      repository.findByCode.mockResolvedValue(mockVendor);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should default isActive to true when not provided', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockVendor);

      await service.create({ code: 'VND-002', name: 'Test Vendor' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should allow setting isActive to false on creation', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...mockVendor, isActive: false });

      await service.create({ ...dto, isActive: false });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('should set nullable fields to null when not provided', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockVendor);

      await service.create({ code: 'VND-003', name: 'Minimal Vendor' });

      expect(repository.create).toHaveBeenCalledWith({
        code: 'VND-003',
        name: 'Minimal Vendor',
        phone: null,
        email: null,
        address: null,
        taxId: null,
        isActive: true,
      });
    });
  });

  describe('findAll', () => {
    const mockPaginatedResult = {
      data: [mockVendor],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated vendors with default pagination', async () => {
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

      const filters = { code: 'VND', name: 'สยาม', isActive: true };
      const pagination = { page: 2, pageSize: 10 };

      await service.findAll(filters, pagination);

      expect(repository.findMany).toHaveBeenCalledWith(filters, pagination);
    });
  });

  describe('findById', () => {
    it('should return vendor when found', async () => {
      repository.findById.mockResolvedValue(mockVendor);

      const result = await service.findById(mockVendor.id);

      expect(repository.findById).toHaveBeenCalledWith(mockVendor.id);
      expect(result).toEqual(mockVendor);
    });

    it('should throw NotFoundException when vendor not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const dto: UpdateVendorDto = {
      name: 'บริษัท สยามซัพพลาย (ประเทศไทย) จำกัด',
    };

    it('should update an existing vendor', async () => {
      const updatedVendor = { ...mockVendor, name: 'บริษัท สยามซัพพลาย (ประเทศไทย) จำกัด' };
      repository.findById.mockResolvedValue(mockVendor);
      repository.update.mockResolvedValue(updatedVendor);

      const result = await service.update(mockVendor.id, dto);

      expect(repository.update).toHaveBeenCalledWith(mockVendor.id, {
        name: 'บริษัท สยามซัพพลาย (ประเทศไทย) จำกัด',
      });
      expect(result).toEqual(updatedVendor);
    });

    it('should throw NotFoundException if vendor does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('550e8400-e29b-41d4-a716-446655440099', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new code already exists', async () => {
      const anotherVendor = { ...mockVendor, id: 'other-id', code: 'VND-999' };
      repository.findById.mockResolvedValue(mockVendor);
      repository.findByCode.mockResolvedValue(anotherVendor);

      await expect(
        service.update(mockVendor.id, { code: 'VND-999' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same code without conflict', async () => {
      repository.findById.mockResolvedValue(mockVendor);
      repository.update.mockResolvedValue(mockVendor);

      // Updating with the same code should not trigger uniqueness check
      await service.update(mockVendor.id, { code: 'VND-001' });

      expect(repository.findByCode).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft-delete a vendor', async () => {
      const deletedVendor = { ...mockVendor, isActive: false };
      repository.findById.mockResolvedValue(mockVendor);
      repository.softDelete.mockResolvedValue(deletedVendor);

      const result = await service.delete(mockVendor.id);

      expect(repository.softDelete).toHaveBeenCalledWith(mockVendor.id);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if vendor does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.delete('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
