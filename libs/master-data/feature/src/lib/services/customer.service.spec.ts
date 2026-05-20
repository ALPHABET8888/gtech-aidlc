import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerRepository } from '@autoflow/master-data-data-access';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';

describe('CustomerService', () => {
  let service: CustomerService;
  let repository: jest.Mocked<CustomerRepository>;

  const mockCustomer = {
    id: '550e8400-e29b-41d4-a716-446655440020',
    code: 'CUS-001',
    name: 'บริษัท เอบีซี จำกัด',
    taxId: '0105559012345',
    address: '456 ถ.พหลโยธิน กรุงเทพฯ 10400',
    phone: '02-987-6543',
    email: 'info@abc-company.co.th',
    isActive: true,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: CustomerRepository,
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

    service = module.get<CustomerService>(CustomerService);
    repository = module.get(CustomerRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateCustomerDto = {
      code: 'CUS-001',
      name: 'บริษัท เอบีซี จำกัด',
      phone: '02-987-6543',
      email: 'info@abc-company.co.th',
      address: '456 ถ.พหลโยธิน กรุงเทพฯ 10400',
      taxId: '0105559012345',
    };

    it('should create a new customer successfully', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockCustomer);

      const result = await service.create(dto);

      expect(repository.findByCode).toHaveBeenCalledWith('CUS-001');
      expect(repository.create).toHaveBeenCalledWith({
        code: 'CUS-001',
        name: 'บริษัท เอบีซี จำกัด',
        phone: '02-987-6543',
        email: 'info@abc-company.co.th',
        address: '456 ถ.พหลโยธิน กรุงเทพฯ 10400',
        taxId: '0105559012345',
        isActive: true,
      });
      expect(result).toEqual(mockCustomer);
    });

    it('should throw ConflictException if code already exists', async () => {
      repository.findByCode.mockResolvedValue(mockCustomer);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should default isActive to true when not provided', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockCustomer);

      await service.create({ code: 'CUS-002', name: 'Test Customer' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should allow setting isActive to false on creation', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue({ ...mockCustomer, isActive: false });

      await service.create({ ...dto, isActive: false });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('should set nullable fields to null when not provided', async () => {
      repository.findByCode.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockCustomer);

      await service.create({ code: 'CUS-003', name: 'Minimal Customer' });

      expect(repository.create).toHaveBeenCalledWith({
        code: 'CUS-003',
        name: 'Minimal Customer',
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
      data: [mockCustomer],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated customers with default pagination', async () => {
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

      const filters = { code: 'CUS', name: 'เอบีซี', isActive: true };
      const pagination = { page: 2, pageSize: 10 };

      await service.findAll(filters, pagination);

      expect(repository.findMany).toHaveBeenCalledWith(filters, pagination);
    });
  });

  describe('findById', () => {
    it('should return customer when found', async () => {
      repository.findById.mockResolvedValue(mockCustomer);

      const result = await service.findById(mockCustomer.id);

      expect(repository.findById).toHaveBeenCalledWith(mockCustomer.id);
      expect(result).toEqual(mockCustomer);
    });

    it('should throw NotFoundException when customer not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const dto: UpdateCustomerDto = {
      name: 'บริษัท เอบีซี (ประเทศไทย) จำกัด',
    };

    it('should update an existing customer', async () => {
      const updatedCustomer = { ...mockCustomer, name: 'บริษัท เอบีซี (ประเทศไทย) จำกัด' };
      repository.findById.mockResolvedValue(mockCustomer);
      repository.update.mockResolvedValue(updatedCustomer);

      const result = await service.update(mockCustomer.id, dto);

      expect(repository.update).toHaveBeenCalledWith(mockCustomer.id, {
        name: 'บริษัท เอบีซี (ประเทศไทย) จำกัด',
      });
      expect(result).toEqual(updatedCustomer);
    });

    it('should throw NotFoundException if customer does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('550e8400-e29b-41d4-a716-446655440099', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new code already exists', async () => {
      const anotherCustomer = { ...mockCustomer, id: 'other-id', code: 'CUS-999' };
      repository.findById.mockResolvedValue(mockCustomer);
      repository.findByCode.mockResolvedValue(anotherCustomer);

      await expect(
        service.update(mockCustomer.id, { code: 'CUS-999' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same code without conflict', async () => {
      repository.findById.mockResolvedValue(mockCustomer);
      repository.update.mockResolvedValue(mockCustomer);

      // Updating with the same code should not trigger uniqueness check
      await service.update(mockCustomer.id, { code: 'CUS-001' });

      expect(repository.findByCode).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should soft-delete a customer', async () => {
      const deletedCustomer = { ...mockCustomer, isActive: false };
      repository.findById.mockResolvedValue(mockCustomer);
      repository.softDelete.mockResolvedValue(deletedCustomer);

      const result = await service.delete(mockCustomer.id);

      expect(repository.softDelete).toHaveBeenCalledWith(mockCustomer.id);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if customer does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.delete('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
