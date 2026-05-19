import { NotFoundException } from '@nestjs/common';
import { MockMasterDataQueryService } from './mock-master-data-query.service';

describe('MockMasterDataQueryService', () => {
  let service: MockMasterDataQueryService;

  beforeEach(() => {
    service = new MockMasterDataQueryService();
    service.loadItems([
      { id: 'item-1', name: 'Widget A', sku: 'WGT-001', unit: 'PCS' },
      { id: 'item-2', name: 'Widget B', sku: 'WGT-002', unit: 'BOX' },
    ]);
    service.loadWarehouses([
      { id: 'wh-1', name: 'Main Warehouse', code: 'WH-MAIN' },
      { id: 'wh-2', name: 'Branch Warehouse', code: 'WH-BR01' },
    ]);
  });

  describe('getItem', () => {
    it('should return item by ID', async () => {
      const item = await service.getItem('item-1');
      expect(item.name).toBe('Widget A');
      expect(item.sku).toBe('WGT-001');
    });

    it('should throw NotFoundException for unknown item', async () => {
      await expect(service.getItem('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getWarehouse', () => {
    it('should return warehouse by ID', async () => {
      const wh = await service.getWarehouse('wh-1');
      expect(wh.name).toBe('Main Warehouse');
      expect(wh.code).toBe('WH-MAIN');
    });

    it('should throw NotFoundException for unknown warehouse', async () => {
      await expect(service.getWarehouse('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listItems', () => {
    it('should return all loaded items', async () => {
      const items = await service.listItems();
      expect(items).toHaveLength(2);
    });
  });

  describe('listWarehouses', () => {
    it('should return all loaded warehouses', async () => {
      const warehouses = await service.listWarehouses();
      expect(warehouses).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      service.clear();
      const items = await service.listItems();
      const warehouses = await service.listWarehouses();
      expect(items).toHaveLength(0);
      expect(warehouses).toHaveLength(0);
    });
  });
});
