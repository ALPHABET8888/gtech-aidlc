import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Vendor } from '@prisma/client';
import { VendorRepository, PaginatedResult } from '@autoflow/master-data-data-access';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';

export interface VendorFilters {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Service handling Vendor CRUD operations.
 */
@Injectable()
export class VendorService {
  constructor(private readonly vendorRepository: VendorRepository) {}

  /**
   * Create a new Vendor.
   * @throws ConflictException if a vendor with the same code already exists.
   */
  async create(dto: CreateVendorDto): Promise<Vendor> {
    const existing = await this.vendorRepository.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Vendor with code '${dto.code}' already exists`);
    }

    return this.vendorRepository.create({
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
   * List vendors with optional filtering and pagination.
   */
  async findAll(
    filters: VendorFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Vendor>> {
    return this.vendorRepository.findMany(filters, pagination);
  }

  /**
   * Get a single vendor by ID.
   * @throws NotFoundException if vendor is not found.
   */
  async findById(id: string): Promise<Vendor> {
    const vendor = await this.vendorRepository.findById(id);
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID '${id}' not found`);
    }
    return vendor;
  }

  /**
   * Update an existing vendor.
   * @throws NotFoundException if vendor is not found.
   * @throws ConflictException if updating code to one that already exists.
   */
  async update(id: string, dto: UpdateVendorDto): Promise<Vendor> {
    const vendor = await this.vendorRepository.findById(id);
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID '${id}' not found`);
    }

    // Check code uniqueness if code is being changed
    if (dto.code && dto.code !== vendor.code) {
      const existingWithCode = await this.vendorRepository.findByCode(dto.code);
      if (existingWithCode) {
        throw new ConflictException(`Vendor with code '${dto.code}' already exists`);
      }
    }

    return this.vendorRepository.update(id, {
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
   * Soft-delete a vendor by setting isActive to false.
   * @throws NotFoundException if vendor is not found.
   */
  async delete(id: string): Promise<Vendor> {
    const vendor = await this.vendorRepository.findById(id);
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID '${id}' not found`);
    }

    return this.vendorRepository.softDelete(id);
  }
}
