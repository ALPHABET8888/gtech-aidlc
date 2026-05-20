/**
 * Shared interfaces for Master Data module.
 * Matches backend DTOs from the NestJS API.
 */

// ── Pagination ──────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ── Item ────────────────────────────────────────────────────

export interface Item {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemDto {
  code: string;
  name: string;
  unit: string;
  category?: string;
}

export interface UpdateItemDto {
  name?: string;
  unit?: string;
  category?: string;
  isActive?: boolean;
}

// ── Warehouse ───────────────────────────────────────────────

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseDto {
  code: string;
  name: string;
  location?: string;
}

export interface UpdateWarehouseDto {
  name?: string;
  location?: string;
  isActive?: boolean;
}

// ── Vendor ──────────────────────────────────────────────────

export interface Vendor {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorDto {
  code: string;
  name: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface UpdateVendorDto {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

// ── Customer ────────────────────────────────────────────────

export interface Customer {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerDto {
  code: string;
  name: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface UpdateCustomerDto {
  name?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}

// ── User & Role ─────────────────────────────────────────────

export type RoleName = 'CASHIER' | 'STORE' | 'SUPERVISOR' | 'MANAGER' | 'CFO' | 'ADMIN';

export interface Role {
  id: string;
  name: RoleName;
  description: string | null;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  assignedAt: string;
  role: Role;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userRoles?: UserRole[];
}

export interface CreateUserDto {
  username: string;
  password: string;
  fullName: string;
  email?: string;
}

export interface UpdateUserDto {
  fullName?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
}

// ── Period ───────────────────────────────────────────────────

export type PeriodStatus = 'OPEN' | 'CLOSED';

export interface Period {
  id: string;
  period: string; // YYYY-MM
  status: PeriodStatus;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
}

export interface CreatePeriodDto {
  period: string; // YYYY-MM
}

// ── Stock Balance ───────────────────────────────────────────

export interface StockBalance {
  id: string;
  itemId: string;
  warehouseId: string;
  qty: number;
  totalValue: number;
  ma: number;
  isFrozen: boolean;
  lastTxId: string | null;
  updatedAt: string;
  item?: Item;
  warehouse?: Warehouse;
}

// ── TX Log ──────────────────────────────────────────────────

export type TxStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export type TxType =
  | 'GR_RECEIVE'
  | 'GR_RETURN'
  | 'GR_REPLACEMENT'
  | 'SALE_INVOICE'
  | 'TEMP_DO'
  | 'JOB_ORDER'
  | 'CN_SALES_RETURN'
  | 'CN_SALES_PRICE'
  | 'CN_RETURN'
  | 'CN_PRICE_ADJ'
  | 'AP_CN_DEBT'
  | 'AP_PAYMENT'
  | 'AR_RECEIVE'
  | 'ADJ_COUNT_UP'
  | 'ADJ_COUNT_DOWN'
  | 'ADJ_TRANSFER'
  | 'ADJ_WRITEOFF'
  | 'VOID';

export type VatType = 'INPUT' | 'OUTPUT' | 'NONE';
export type ApArStatus = 'OPEN' | 'PARTIAL' | 'CLOSED';

export interface TxLog {
  id: string;
  txType: TxType;
  txStatus: TxStatus;
  txDate: string;
  period: string;
  itemId: string | null;
  warehouseId: string | null;
  qty: number | null;
  unitCost: number | null;
  totalCost: number | null;
  maBefore: number | null;
  maAfter: number | null;
  stockBefore: number | null;
  stockAfter: number | null;
  vendorId: string | null;
  customerId: string | null;
  refJoId: string | null;
  refDoId: string | null;
  refInvoiceId: string | null;
  refGrId: string | null;
  refCnId: string | null;
  parentTxId: string | null;
  taxInvoiceNo: string | null;
  baseAmount: number | null;
  vatAmount: number | null;
  vatType: VatType | null;
  arAmount: number | null;
  apAmount: number | null;
  apArStatus: ApArStatus | null;
  cogsUnit: number | null;
  reason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TxLogQueryParams extends PaginationParams {
  txType?: TxType;
  txStatus?: TxStatus;
  period?: string;
  itemId?: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
}
