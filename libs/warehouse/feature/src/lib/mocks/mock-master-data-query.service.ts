import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IMasterDataQueryService,
  ItemData,
  WarehouseData,
} from './interfaces';

/**
 * Mock implementation of IMasterDataQueryService.
 * Returns items and warehouses from in-memory data (loaded from JSON fixtures).
 */
@Injectable()
export class MockMasterDataQueryService implements IMasterDataQueryService {
  private readonly items: Map<string, ItemData> = new Map();
  private readonly warehouses: Map<string, WarehouseData> = new Map();

  /**
   * Load items from fixture data.
   */
  loadItems(items: ItemData[]): void {
    for (const item of items) {
      this.items.set(item.id, { ...item });
    }
  }

  /**
   * Load warehouses from fixture data.
   */
  loadWarehouses(warehouses: WarehouseData[]): void {
    for (const warehouse of warehouses) {
      this.warehouses.set(warehouse.id, { ...warehouse });
    }
  }

  /**
   * Get item by ID.
   * @throws NotFoundException if item not found
   */
  async getItem(id: string): Promise<ItemData> {
    const item = this.items.get(id);
    if (!item) {
      throw new NotFoundException(`Item not found: ${id}`);
    }
    return item;
  }

  /**
   * Get warehouse by ID.
   * @throws NotFoundException if warehouse not found
   */
  async getWarehouse(id: string): Promise<WarehouseData> {
    const warehouse = this.warehouses.get(id);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse not found: ${id}`);
    }
    return warehouse;
  }

  /**
   * List all available items.
   */
  async listItems(): Promise<ItemData[]> {
    return Array.from(this.items.values());
  }

  /**
   * List all available warehouses.
   */
  async listWarehouses(): Promise<WarehouseData[]> {
    return Array.from(this.warehouses.values());
  }

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.items.clear();
    this.warehouses.clear();
  }
}
