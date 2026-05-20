/**
 * Item master data record.
 */
export interface Item {
  /** Item ID (UUID v4) */
  id: string;
  /** Item code (unique identifier for display) */
  code: string;
  /** Item name */
  name: string;
  /** Unit of measure (e.g., 'PCS', 'KG', 'BOX') */
  unit: string;
  /** Item category */
  category: string;
  /** Whether the item is active */
  isActive: boolean;
}

/**
 * Vendor master data record.
 */
export interface Vendor {
  /** Vendor ID (UUID v4) */
  id: string;
  /** Vendor code */
  code: string;
  /** Vendor name */
  name: string;
  /** Tax ID */
  taxId: string;
  /** Contact information */
  contactName: string;
  /** Whether the vendor is active */
  isActive: boolean;
}

/**
 * Customer master data record.
 */
export interface Customer {
  /** Customer ID (UUID v4) */
  id: string;
  /** Customer code */
  code: string;
  /** Customer name */
  name: string;
  /** Tax ID */
  taxId: string;
  /** Contact information */
  contactName: string;
  /** Whether the customer is active */
  isActive: boolean;
}

/**
 * Warehouse master data record.
 */
export interface Warehouse {
  /** Warehouse ID (UUID v4) */
  id: string;
  /** Warehouse code */
  code: string;
  /** Warehouse name */
  name: string;
  /** Location description */
  location: string;
  /** Whether the warehouse is active */
  isActive: boolean;
}

/**
 * Service interface for master data lookups.
 * Provides read access to items, vendors, customers, and warehouses.
 */
export interface IMasterDataLookupService {
  /**
   * Get item by ID.
   * @throws NotFoundException if item not found
   */
  getItem(itemId: string): Promise<Item>;

  /**
   * Get vendor by ID.
   * @throws NotFoundException if vendor not found
   */
  getVendor(vendorId: string): Promise<Vendor>;

  /**
   * Get customer by ID.
   * @throws NotFoundException if customer not found
   */
  getCustomer(customerId: string): Promise<Customer>;

  /**
   * Get warehouse by ID.
   * @throws NotFoundException if warehouse not found
   */
  getWarehouse(warehouseId: string): Promise<Warehouse>;

  /**
   * List all active items.
   */
  listItems(): Promise<Item[]>;

  /**
   * List all active vendors.
   */
  listVendors(): Promise<Vendor[]>;

  /**
   * List all active customers.
   */
  listCustomers(): Promise<Customer[]>;

  /**
   * List all active warehouses.
   */
  listWarehouses(): Promise<Warehouse[]>;
}
