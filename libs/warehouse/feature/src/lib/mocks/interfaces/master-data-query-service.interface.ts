/**
 * Item master data.
 */
export interface ItemData {
  id: string;
  name: string;
  sku: string;
  unit: string;
}

/**
 * Warehouse master data.
 */
export interface WarehouseData {
  id: string;
  name: string;
  code: string;
}

/**
 * Service interface for querying master data (items, warehouses).
 * Used for display purposes and validation lookups.
 */
export interface IMasterDataQueryService {
  /**
   * Get item by ID.
   * @throws NotFoundException if item not found
   */
  getItem(id: string): Promise<ItemData>;

  /**
   * Get warehouse by ID.
   * @throws NotFoundException if warehouse not found
   */
  getWarehouse(id: string): Promise<WarehouseData>;

  /**
   * List all available items.
   */
  listItems(): Promise<ItemData[]>;

  /**
   * List all available warehouses.
   */
  listWarehouses(): Promise<WarehouseData[]>;
}
