import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Item } from '@prisma/client';
import { ItemRepository, PaginatedResult } from '@autoflow/master-data-data-access';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';

export interface ItemFilters {
  code?: string;
  name?: string;
  category?: string;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Service handling Item CRUD operations.
 */
@Injectable()
export class ItemService {
  constructor(private readonly itemRepository: ItemRepository) {}

  /**
   * Create a new Item.
   * @throws ConflictException if an item with the same code already exists.
   */
  async create(dto: CreateItemDto): Promise<Item> {
    const existing = await this.itemRepository.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Item with code '${dto.code}' already exists`);
    }

    return this.itemRepository.create({
      code: dto.code,
      name: dto.name,
      unit: dto.unit,
      category: dto.category ?? null,
      isActive: dto.isActive ?? true,
    });
  }

  /**
   * List items with optional filtering and pagination.
   */
  async findAll(
    filters: ItemFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<Item>> {
    return this.itemRepository.findMany(filters, pagination);
  }

  /**
   * Get a single item by ID.
   * @throws NotFoundException if item is not found.
   */
  async findById(id: string): Promise<Item> {
    const item = await this.itemRepository.findById(id);
    if (!item) {
      throw new NotFoundException(`Item with ID '${id}' not found`);
    }
    return item;
  }

  /**
   * Update an existing item.
   * @throws NotFoundException if item is not found.
   * @throws ConflictException if updating code to one that already exists.
   */
  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.itemRepository.findById(id);
    if (!item) {
      throw new NotFoundException(`Item with ID '${id}' not found`);
    }

    // Check code uniqueness if code is being changed
    if (dto.code && dto.code !== item.code) {
      const existingWithCode = await this.itemRepository.findByCode(dto.code);
      if (existingWithCode) {
        throw new ConflictException(`Item with code '${dto.code}' already exists`);
      }
    }

    return this.itemRepository.update(id, {
      ...(dto.code !== undefined && { code: dto.code }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.unit !== undefined && { unit: dto.unit }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
  }

  /**
   * Soft-delete an item by setting isActive to false.
   * @throws NotFoundException if item is not found.
   */
  async delete(id: string): Promise<Item> {
    const item = await this.itemRepository.findById(id);
    if (!item) {
      throw new NotFoundException(`Item with ID '${id}' not found`);
    }

    return this.itemRepository.softDelete(id);
  }
}
