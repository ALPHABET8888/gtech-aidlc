import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Warehouse } from '@prisma/client';
import { WarehouseRepository, PaginatedResult } from '@autoflow/master-data-data-access';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';

export interface WarehouseFilters {
  code?: string;
  name?: string;
  location?: string;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Service handling Warehouse CRUD operations.
 */
@Injectable()
export class WarehouseService {
  constructor(private readonly warehouseRepository: WarehouseRepository) {}

  /**
   * Create a new Warehouse.
   * @throws ConflictException if a warehouse with the same code already exists.
   */
  async create(dto: CreateWarehouseDto): Promise<Warehouse> {
    const existing = await this.warehouseRepository.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Warehouse with code '${dto.code}' already exists`);
    }

    return this.warehouseRepository.create({
      code: dto.code,
      name: dto.name,
      location: dto.location ?? null,
      isActive: dto.isActive ?? true,
    });
  }

  /**
   * List warehouses with optional filtering and pagination.
   */
  async findAll(
    filters: WarehouseFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Warehouse>> {
    return this.warehouseRepository.findMany(filters, pagination);
  }

  /**
   * Get a single warehouse by ID.
   * @throws NotFoundException if warehouse is not found.
   */
  async findById(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findById(id);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID '${id}' not found`);
    }
    return warehouse;
  }

  /**
   * Update an existing warehouse.
   * @throws NotFoundException if warehouse is not found.
   * @throws ConflictException if updating code to one that already exists.
   */
  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findById(id);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID '${id}' not found`);
    }

    // Check code uniqueness if code is being changed
    if (dto.code && dto.code !== warehouse.code) {
      const existingWithCode = await this.warehouseRepository.findByCode(dto.code);
      if (existingWithCode) {
        throw new ConflictException(`Warehouse with code '${dto.code}' already exists`);
      }
    }

    return this.warehouseRepository.update(id, {
      ...(dto.code !== undefined && { code: dto.code }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }

  /**
   * Soft-delete a warehouse by setting isActive to false.
   * @throws NotFoundException if warehouse is not found.
   */
  async delete(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findById(id);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID '${id}' not found`);
    }

    return this.warehouseRepository.softDelete(id);
  }
}
