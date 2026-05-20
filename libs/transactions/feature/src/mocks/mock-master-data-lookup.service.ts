import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IMasterDataLookupService,
  Item,
  Vendor,
  Customer,
  Warehouse,
} from '@autoflow/shared-types';

import * as itemsJson from './mock-data/items.json';
import * as vendorsJson from './mock-data/vendors.json';
import * as customersJson from './mock-data/customers.json';
import * as warehousesJson from './mock-data/warehouses.json';

// Handle both ESM and CJS module resolution for JSON imports
const toArray = <T>(data: unknown): T[] =>
  Array.isArray(data) ? data : Array.isArray((data as { default?: unknown }).default) ? (data as { default: T[] }).default : [];

/**
 * Mock implementation of IMasterDataLookupService.
 * Reads data from JSON fixture files.
 * Used during development until real Master Data module is available.
 */
@Injectable()
export class MockMasterDataLookupService implements IMasterDataLookupService {
  private items: Item[] = toArray<Item>(itemsJson);
  private vendors: Vendor[] = toArray<Vendor>(vendorsJson);
  private customers: Customer[] = toArray<Customer>(customersJson);
  private warehouses: Warehouse[] = toArray<Warehouse>(warehousesJson);

  async getItem(itemId: string): Promise<Item> {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`Item not found: ${itemId}`);
    }
    return item;
  }

  async getVendor(vendorId: string): Promise<Vendor> {
    const vendor = this.vendors.find((v) => v.id === vendorId);
    if (!vendor) {
      throw new NotFoundException(`Vendor not found: ${vendorId}`);
    }
    return vendor;
  }

  async getCustomer(customerId: string): Promise<Customer> {
    const customer = this.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${customerId}`);
    }
    return customer;
  }

  async getWarehouse(warehouseId: string): Promise<Warehouse> {
    const warehouse = this.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) {
      throw new NotFoundException(`Warehouse not found: ${warehouseId}`);
    }
    return warehouse;
  }

  async listItems(): Promise<Item[]> {
    return this.items.filter((i) => i.isActive);
  }

  async listVendors(): Promise<Vendor[]> {
    return this.vendors.filter((v) => v.isActive);
  }

  async listCustomers(): Promise<Customer[]> {
    return this.customers.filter((c) => c.isActive);
  }

  async listWarehouses(): Promise<Warehouse[]> {
    return this.warehouses.filter((w) => w.isActive);
  }

  /**
   * Override fixture data — useful for testing with custom data.
   */
  setItems(items: Item[]): void {
    this.items = items;
  }

  setVendors(vendors: Vendor[]): void {
    this.vendors = vendors;
  }

  setCustomers(customers: Customer[]): void {
    this.customers = customers;
  }

  setWarehouses(warehouses: Warehouse[]): void {
    this.warehouses = warehouses;
  }

  /**
   * Reset to original fixture data.
   */
  reset(): void {
    this.items = toArray<Item>(itemsJson);
    this.vendors = toArray<Vendor>(vendorsJson);
    this.customers = toArray<Customer>(customersJson);
    this.warehouses = toArray<Warehouse>(warehousesJson);
  }
}
