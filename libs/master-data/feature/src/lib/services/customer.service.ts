import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Customer } from '@prisma/client';
import { CustomerRepository, PaginatedResult } from '@autoflow/master-data-data-access';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';

export interface CustomerFilters {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Service handling Customer CRUD operations.
 */
@Injectable()
export class CustomerService {
  constructor(private readonly customerRepository: CustomerRepository) {}

  /**
   * Create a new Customer.
   * @throws ConflictException if a customer with the same code already exists.
   */
  async create(dto: CreateCustomerDto): Promise<Customer> {
    const existing = await this.customerRepository.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Customer with code '${dto.code}' already exists`);
    }

    return this.customerRepository.create({
      code: dto.code,
      name: dto.name,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      address: dto.address ?? null,
      taxId: dto.taxId ?? null,
      isActive: dto.isActive ?? true,
    });
  }

  /**
   * List customers with optional filtering and pagination.
   */
  async findAll(
    filters: CustomerFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Customer>> {
    return this.customerRepository.findMany(filters, pagination);
  }

  /**
   * Get a single customer by ID.
   * @throws NotFoundException if customer is not found.
   */
  async findById(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${id}' not found`);
    }
    return customer;
  }

  /**
   * Update an existing customer.
   * @throws NotFoundException if customer is not found.
   * @throws ConflictException if updating code to one that already exists.
   */
  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${id}' not found`);
    }

    // Check code uniqueness if code is being changed
    if (dto.code && dto.code !== customer.code) {
      const existingWithCode = await this.customerRepository.findByCode(dto.code);
      if (existingWithCode) {
        throw new ConflictException(`Customer with code '${dto.code}' already exists`);
      }
    }

    return this.customerRepository.update(id, {
      ...(dto.code !== undefined && { code: dto.code }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.taxId !== undefined && { taxId: dto.taxId }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }

  /**
   * Soft-delete a customer by setting isActive to false.
   * @throws NotFoundException if customer is not found.
   */
  async delete(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${id}' not found`);
    }

    return this.customerRepository.softDelete(id);
  }
}
