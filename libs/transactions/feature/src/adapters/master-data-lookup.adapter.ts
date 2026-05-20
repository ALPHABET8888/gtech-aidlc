import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ItemService,
  WarehouseService,
  VendorService,
  CustomerService,
} from '@autoflow/master-data-feature';
import {
  IMasterDataLookupService,
  Item as IItem,
  Vendor as IVendor,
  Customer as ICustomer,
  Warehouse as IWarehouse,
} from '@autoflow/shared-types';

/**
 * Adapter that bridges the real Master Data CRUD services
 * to the IMasterDataLookupService interface expected by Transactions unit.
 */
@Injectable()
export class MasterDataLookupAdapter implements IMasterDataLookupService {
  constructor(
    private readonly itemService: ItemService,
    private readonly warehouseService: WarehouseService,
    private readonly vendorService: VendorService,
    private readonly customerService: CustomerService,
  ) {}

  async getItem(itemId: string): Promise<IItem> {
    const item = await this.itemService.findById(itemId);
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category ?? '',
      isActive: item.isActive,
    };
  }

  async getVendor(vendorId: string): Promise<IVendor> {
    const vendor = await this.vendorService.findById(vendorId);
    return {
      id: vendor.id,
      code: vendor.code,
      name: vendor.name,
      taxId: vendor.taxId ?? '',
      contactName: vendor.phone ?? '',
      isActive: vendor.isActive,
    };
  }

  async getCustomer(customerId: string): Promise<ICustomer> {
    const customer = await this.customerService.findById(customerId);
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      taxId: customer.taxId ?? '',
      contactName: customer.phone ?? '',
      isActive: customer.isActive,
    };
  }

  async getWarehouse(warehouseId: string): Promise<IWarehouse> {
    const warehouse = await this.warehouseService.findById(warehouseId);
    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      location: warehouse.location ?? '',
      isActive: warehouse.isActive,
    };
  }

  async listItems(): Promise<IItem[]> {
    const result = await this.itemService.findAll({ isActive: true }, { page: 1, pageSize: 1000 });
    return result.data.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category ?? '',
      isActive: item.isActive,
    }));
  }

  async listVendors(): Promise<IVendor[]> {
    const result = await this.vendorService.findAll({ isActive: true }, { page: 1, pageSize: 1000 });
    return result.data.map((vendor) => ({
      id: vendor.id,
      code: vendor.code,
      name: vendor.name,
      taxId: vendor.taxId ?? '',
      contactName: vendor.phone ?? '',
      isActive: vendor.isActive,
    }));
  }

  async listCustomers(): Promise<ICustomer[]> {
    const result = await this.customerService.findAll({ isActive: true }, { page: 1, pageSize: 1000 });
    return result.data.map((customer) => ({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      taxId: customer.taxId ?? '',
      contactName: customer.phone ?? '',
      isActive: customer.isActive,
    }));
  }

  async listWarehouses(): Promise<IWarehouse[]> {
    const result = await this.warehouseService.findAll({ isActive: true }, { page: 1, pageSize: 1000 });
    return result.data.map((warehouse) => ({
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      location: warehouse.location ?? '',
      isActive: warehouse.isActive,
    }));
  }
}
