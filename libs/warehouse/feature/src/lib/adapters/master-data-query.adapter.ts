import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ItemService,
  WarehouseService,
} from '@autoflow/master-data-feature';
import {
  IMasterDataQueryService,
  ItemData,
  WarehouseData,
} from '../mocks/interfaces';

/**
 * Adapter that bridges the real Master Data CRUD services
 * to the IMasterDataQueryService interface expected by Warehouse unit.
 */
@Injectable()
export class WarehouseMasterDataQueryAdapter implements IMasterDataQueryService {
  constructor(
    private readonly itemService: ItemService,
    private readonly warehouseService: WarehouseService,
  ) {}

  async getItem(id: string): Promise<ItemData> {
    const item = await this.itemService.findById(id);
    return {
      id: item.id,
      name: item.name,
      sku: item.code,
      unit: item.unit,
    };
  }

  async getWarehouse(id: string): Promise<WarehouseData> {
    const warehouse = await this.warehouseService.findById(id);
    return {
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
    };
  }

  async listItems(): Promise<ItemData[]> {
    const result = await this.itemService.findAll({ isActive: true }, { page: 1, pageSize: 1000 });
    return result.data.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.code,
      unit: item.unit,
    }));
  }

  async listWarehouses(): Promise<WarehouseData[]> {
    const result = await this.warehouseService.findAll({ isActive: true }, { page: 1, pageSize: 1000 });
    return result.data.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
    }));
  }
}
