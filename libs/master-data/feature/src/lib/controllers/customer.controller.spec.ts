import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from '../services/customer.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';

describe('CustomerController', () => {
  let controller: CustomerController;
  let service: jest.Mocked<CustomerService>;

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
      controllers: [CustomerController],
      providers: [
        {
          provide: CustomerService,
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

    controller = module.get<CustomerController>(CustomerController);
    service = module.get(CustomerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /customers (create)', () => {
    const dto: CreateCustomerDto = {
      code: 'CUS-001',
      name: 'บริษัท เอบีซี จำกัด',
      phone: '02-987-6543',
      email: 'info@abc-company.co.th',
      address: '456 ถ.พหลโยธิน กรุงเทพฯ 10400',
      taxId: '0105559012345',
    };

    it('should create and return the new customer', async () => {
      service.create.mockResolvedValue(mockCustomer);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockCustomer);
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException("Customer with code 'CUS-001' already exists"),
      );

      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('GET /customers (findAll)', () => {
    const mockPaginatedResult = {
      data: [mockCustomer],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated customers with default pagination', async () => {
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
        code: 'CUS',
        name: 'เอบีซี',
        isActive: true,
        page: 2,
        pageSize: 10,
      };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(
        { code: 'CUS', name: 'เอบีซี', isActive: true },
        { page: 2, pageSize: 10 },
      );
    });
  });

  describe('GET /customers/:id (findById)', () => {
    it('should return customer by ID', async () => {
      service.findById.mockResolvedValue(mockCustomer);

      const result = await controller.findById(mockCustomer.id);

      expect(service.findById).toHaveBeenCalledWith(mockCustomer.id);
      expect(result).toEqual(mockCustomer);
    });

    it('should propagate NotFoundException', async () => {
      service.findById.mockRejectedValue(
        new NotFoundException("Customer with ID '...' not found"),
      );

      await expect(
        controller.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /customers/:id (update)', () => {
    const dto: UpdateCustomerDto = { name: 'Updated Customer Name' };

    it('should update and return the customer', async () => {
      const updatedCustomer = { ...mockCustomer, name: 'Updated Customer Name' };
      service.update.mockResolvedValue(updatedCustomer);

      const result = await controller.update(mockCustomer.id, dto);

      expect(service.update).toHaveBeenCalledWith(mockCustomer.id, dto);
      expect(result.name).toBe('Updated Customer Name');
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
        controller.update(mockCustomer.id, { code: 'EXISTING' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /customers/:id (delete)', () => {
    it('should soft-delete and return the deactivated customer', async () => {
      const deletedCustomer = { ...mockCustomer, isActive: false };
      service.delete.mockResolvedValue(deletedCustomer);

      const result = await controller.delete(mockCustomer.id);

      expect(service.delete).toHaveBeenCalledWith(mockCustomer.id);
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
