/**
 * Frontend-specific types for the Transactions feature module.
 * These mirror the backend DTOs but are plain interfaces (no class-validator).
 */

// ── Enums ────────────────────────────────────────────────

export enum JOStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum ReturnCondition {
  GOOD = 'good',
  DAMAGED_TOTAL = 'damaged_total',
}

export enum ApArStatus {
  OPEN = 'OPEN',
  PARTIAL = 'PARTIAL',
  CLOSED = 'CLOSED',
}

// ── Job Order ────────────────────────────────────────────

export interface JobOrderItem {
  itemId: string;
  qty: number;
  unitPrice: number;
  description?: string;
}

export interface JobOrder {
  id: string;
  joNumber: string;
  customerId: string;
  status: JOStatus;
  hasTempDo: boolean;
  invoiceId: string | null;
  items: JobOrderItem[];
  totalAmount: number;
  vatAmount: number;
  grandTotal: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateJobOrderRequest {
  customerId: string;
  items: JobOrderItem[];
  notes?: string;
}

export interface UpdateJoStatusRequest {
  status: JOStatus;
}

// ── Invoice / TEMP_DO ────────────────────────────────────

export interface InvoiceItem {
  itemId: string;
  qty: number;
}

export interface IssueTempDoRequest {
  warehouseId: string;
  items: InvoiceItem[];
}

export interface IssueInvoiceRequest {
  warehouseId: string;
  items: InvoiceItem[];
}

export interface TxEntry {
  id: string;
  txType: string;
  status: string;
  taxInvoiceNo?: string;
  maBefore?: number;
  maAfter?: number;
}

export interface ArOpenItem {
  id: string;
  status: ApArStatus;
  originalAmount: number;
  remainingAmount?: number;
}

export interface InvoiceResponse {
  txEntry: TxEntry;
  arOpenItem: ArOpenItem;
}

// ── Sales CN ─────────────────────────────────────────────

export interface SalesReturnItem {
  itemId: string;
  qty: number;
  warehouseId: string;
}

export interface CreateSalesReturnRequest {
  refInvoiceTxId: string;
  condition: ReturnCondition;
  items: SalesReturnItem[];
  reason: string;
}

export interface CreateSalesPriceAdjRequest {
  refInvoiceTxId: string;
  adjustmentAmount: number;
  reason: string;
}

export interface ArReduction {
  openItemId: string;
  reducedAmount: number;
  newStatus: ApArStatus;
}

export interface SalesCnResponse {
  txEntry: TxEntry;
  arReduction: ArReduction;
}

// ── Purchasing: Goods Receipt ─────────────────────────────

export interface GrReceiveItem {
  itemId: string;
  qty: number;
  unitCost: number;
  landedCost: number;
}

export interface GrReceiveRequest {
  vendorId: string;
  taxInvoiceNo: string;
  warehouseId: string;
  items: GrReceiveItem[];
  period: string;
}

export interface ApOpenItem {
  id: string;
  status: ApArStatus;
  originalAmount: number;
  remainingAmount?: number;
}

export interface GrReceiveResponse {
  txEntry: TxEntry;
  apOpenItem: ApOpenItem;
}

export interface GrReturnItem {
  itemId: string;
  qty: number;
}

export interface GrReturnRequest {
  refGrTxId: string;
  vendorId: string;
  warehouseId: string;
  items: GrReturnItem[];
  reason: string;
}

export interface GrIrClearing {
  id: string;
  grReturnTxId: string;
  vendorId: string;
  clearingAmount: number;
  status: 'OPEN' | 'CLOSED';
  ppvAmount: number | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrReturnResponse {
  txEntry: TxEntry;
  clearing: { id: string; clearingAmount: number; status: string };
}

export interface GrReplacementItem {
  itemId: string;
  qty: number;
}

export interface GrReplacementRequest {
  refGrReturnTxId: string;
  clearingId: string;
  warehouseId: string;
  items: GrReplacementItem[];
}

export interface GrReplacementResponse {
  txEntry: TxEntry;
  clearing: { id: string; status: string; ppvAmount: number };
}

// ── Purchasing: Credit Notes ─────────────────────────────

export interface CnReturnRequest {
  refGrReturnTxId: string;
  clearingId: string;
}

export interface ApReduction {
  openItemId: string;
  reducedAmount: number;
  newStatus?: ApArStatus;
}

export interface CnReturnResponse {
  txEntry: TxEntry;
  apReduction: ApReduction;
  clearing: { id: string; status: string; ppvAmount: number };
}

export interface CnPriceAdjRequest {
  refGrTxId: string;
  adjustmentPerUnit: number;
  qty: number;
}

export interface CnPriceAdjResponse {
  txEntry: TxEntry;
  apReduction: ApReduction;
  inventoryImpact: { remainingQty: number; soldQty: number; cogsAdjAmount: number };
}

export interface CnDebtRequest {
  refInvoiceTxId: string;
  amount: number;
  reason: string;
}

export interface CnDebtResponse {
  txEntry: TxEntry;
  apReduction: ApReduction;
}

// ── Master Data (for frontend selection) ─────────────────

export interface MasterItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  isActive: boolean;
}

export interface MasterVendor {
  id: string;
  code: string;
  name: string;
  taxId: string;
  contactName: string;
  isActive: boolean;
}

export interface MasterWarehouse {
  id: string;
  code: string;
  name: string;
  location: string;
  isActive: boolean;
}

// ── AP/AR Payment ────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CHEQUE';

export interface PaymentAllocationItem {
  apOpenItemId?: string;
  arOpenItemId?: string;
  amount: number;
}

export interface MakeApPaymentRequest {
  vendorId: string;
  totalAmount: number;
  allocations: { apOpenItemId: string; amount: number }[];
  paymentMethod: PaymentMethod;
  paymentRef?: string;
}

export interface ReceiveArPaymentRequest {
  customerId: string;
  totalAmount: number;
  allocations: { arOpenItemId: string; amount: number }[];
  paymentMethod: PaymentMethod;
  paymentRef?: string;
}

export interface PaymentAllocationResult {
  apOpenItemId?: string;
  arOpenItemId?: string;
  amount: number;
  newStatus: ApArStatus;
}

export interface PaymentResponse {
  txEntry: TxEntry;
  allocations: PaymentAllocationResult[];
}

export interface ApOpenItemDetail {
  id: string;
  vendorId: string;
  status: ApArStatus;
  originalAmount: number;
  remainingAmount: number;
  txId: string;
  txType: string;
  createdAt: string;
}

export interface ArOpenItemDetail {
  id: string;
  customerId: string;
  status: ApArStatus;
  originalAmount: number;
  remainingAmount: number;
  txId: string;
  txType: string;
  createdAt: string;
}

export interface MasterCustomer {
  id: string;
  code: string;
  name: string;
  taxId: string;
  contactName: string;
  isActive: boolean;
}

// ── Pagination ───────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
