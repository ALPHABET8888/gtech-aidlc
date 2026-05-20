import { Injectable, computed, inject, signal } from '@angular/core';
import { TransactionsApiService } from './transactions-api.service';
import {
  JobOrder,
  JOStatus,
  PaginationMeta,
  CreateJobOrderRequest,
  UpdateJoStatusRequest,
  IssueTempDoRequest,
  IssueInvoiceRequest,
  InvoiceResponse,
  CreateSalesReturnRequest,
  CreateSalesPriceAdjRequest,
  SalesCnResponse,
  GrReceiveRequest,
  GrReceiveResponse,
  GrReturnRequest,
  GrReturnResponse,
  CnReturnRequest,
  CnReturnResponse,
  CnPriceAdjRequest,
  CnPriceAdjResponse,
  CnDebtRequest,
  CnDebtResponse,
  GrIrClearing,
  MasterItem,
  MasterVendor,
  MasterWarehouse,
  MakeApPaymentRequest,
  ReceiveArPaymentRequest,
  PaymentResponse,
  ApOpenItemDetail,
  ArOpenItemDetail,
  MasterCustomer,
} from '../models';

/**
 * Signal-based state management for the Transactions feature (D3-7).
 * Uses Angular Signals + computed signals for reactive UI state.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsStateService {
  private readonly api = inject(TransactionsApiService);

  // ── Job Order List State ─────────────────────────────────

  readonly jobOrders = signal<JobOrder[]>([]);
  readonly jobOrdersMeta = signal<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  readonly jobOrdersLoading = signal(false);
  readonly jobOrdersError = signal<string | null>(null);

  // ── Job Order Detail State ───────────────────────────────

  readonly selectedJobOrder = signal<JobOrder | null>(null);
  readonly selectedJobOrderLoading = signal(false);
  readonly selectedJobOrderError = signal<string | null>(null);

  // ── Form Submission State ────────────────────────────────

  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly submitSuccess = signal<string | null>(null);

  // Aliases for backward compatibility with other task implementations
  readonly lastError = this.submitError;
  readonly lastSuccess = this.submitSuccess;

  // ── Computed Signals ─────────────────────────────────────

  readonly hasJobOrders = computed(() => this.jobOrders().length > 0);
  readonly canCreateInvoice = computed(() => {
    const jo = this.selectedJobOrder();
    return jo !== null && jo.status === JOStatus.DONE;
  });
  readonly canIssueTempDo = computed(() => {
    const jo = this.selectedJobOrder();
    return jo !== null && jo.status === JOStatus.DONE && !jo.hasTempDo;
  });
  readonly canIssueInvoice = computed(() => {
    const jo = this.selectedJobOrder();
    return jo !== null && jo.status === JOStatus.DONE && jo.invoiceId === null;
  });

  // ── Job Order Actions ────────────────────────────────────

  loadJobOrders(params?: { page?: number; limit?: number; status?: string; customerId?: string; sort?: string }): void {
    this.jobOrdersLoading.set(true);
    this.jobOrdersError.set(null);

    this.api.getJobOrders(params).subscribe({
      next: (response) => {
        this.jobOrders.set(response.data);
        this.jobOrdersMeta.set(response.meta);
        this.jobOrdersLoading.set(false);
      },
      error: (err) => {
        this.jobOrdersError.set(err.error?.message || 'Failed to load job orders');
        this.jobOrdersLoading.set(false);
      },
    });
  }

  loadJobOrder(id: string): void {
    this.selectedJobOrderLoading.set(true);
    this.selectedJobOrderError.set(null);

    this.api.getJobOrder(id).subscribe({
      next: (jo) => {
        this.selectedJobOrder.set(jo);
        this.selectedJobOrderLoading.set(false);
      },
      error: (err) => {
        this.selectedJobOrderError.set(err.error?.message || 'Failed to load job order');
        this.selectedJobOrderLoading.set(false);
      },
    });
  }

  createJobOrder(dto: CreateJobOrderRequest, onSuccess?: (jo: JobOrder) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createJobOrder(dto).subscribe({
      next: (jo) => {
        this.submitting.set(false);
        this.submitSuccess.set(`Job Order ${jo.joNumber} created successfully`);
        onSuccess?.(jo);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create job order');
      },
    });
  }

  updateJobOrderStatus(id: string, dto: UpdateJoStatusRequest, onSuccess?: (jo: JobOrder) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);

    this.api.updateJobOrderStatus(id, dto).subscribe({
      next: (jo) => {
        this.selectedJobOrder.set(jo);
        this.submitting.set(false);
        this.submitSuccess.set(`Status updated to ${jo.status}`);
        onSuccess?.(jo);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to update status');
      },
    });
  }

  // ── Invoice / TEMP_DO Actions ────────────────────────────

  issueTempDo(joId: string, dto: IssueTempDoRequest, onSuccess?: (res: InvoiceResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.issueTempDo(joId, dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set('TEMP_DO issued successfully');
        // Refresh the JO to reflect hasTempDo = true
        this.loadJobOrder(joId);
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to issue TEMP_DO');
      },
    });
  }

  issueInvoice(joId: string, dto: IssueInvoiceRequest, onSuccess?: (res: InvoiceResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.issueInvoice(joId, dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(`Invoice (${res.txEntry.txType}) issued successfully`);
        this.loadJobOrder(joId);
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to issue invoice');
      },
    });
  }

  // ── Sales CN Actions ─────────────────────────────────────

  createSalesReturn(dto: CreateSalesReturnRequest, onSuccess?: (res: SalesCnResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createSalesReturn(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set('Sales Return CN created successfully');
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create sales return');
      },
    });
  }

  createSalesPriceAdj(dto: CreateSalesPriceAdjRequest, onSuccess?: (res: SalesCnResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createSalesPriceAdj(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set('Sales Price Adjustment CN created successfully');
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create price adjustment');
      },
    });
  }

  // ── Utility ──────────────────────────────────────────────

  clearSubmitState(): void {
    this.submitError.set(null);
    this.submitSuccess.set(null);
  }

  /** Alias for clearSubmitState — used by purchasing components */
  clearMessages(): void {
    this.clearSubmitState();
  }

  clearSelectedJobOrder(): void {
    this.selectedJobOrder.set(null);
    this.selectedJobOrderError.set(null);
  }

  // ── Master Data (Mock) ───────────────────────────────────

  readonly vendors = signal<MasterVendor[]>([
    { id: 'b2c3d4e5-2222-4000-8000-000000000001', code: 'VND-001', name: 'บริษัท ออโต้พาร์ท จำกัด', taxId: '0105500000001', contactName: 'คุณสมชาย', isActive: true },
    { id: 'b2c3d4e5-2222-4000-8000-000000000002', code: 'VND-002', name: 'บริษัท น้ำมันไทย จำกัด', taxId: '0105500000002', contactName: 'คุณวิชัย', isActive: true },
    { id: 'b2c3d4e5-2222-4000-8000-000000000003', code: 'VND-003', name: 'บริษัท อะไหล่ยนต์ จำกัด', taxId: '0105500000003', contactName: 'คุณประเสริฐ', isActive: true },
  ]);

  readonly items = signal<MasterItem[]>([
    { id: 'a1b2c3d4-1111-4000-8000-000000000001', code: 'ITM-001', name: 'น้ำมันเครื่อง 5W-30', unit: 'LTR', category: 'น้ำมันหล่อลื่น', isActive: true },
    { id: 'a1b2c3d4-1111-4000-8000-000000000002', code: 'ITM-002', name: 'ผ้าเบรค หน้า', unit: 'SET', category: 'อะไหล่เบรค', isActive: true },
    { id: 'a1b2c3d4-1111-4000-8000-000000000003', code: 'ITM-003', name: 'กรองอากาศ', unit: 'PCS', category: 'ไส้กรอง', isActive: true },
    { id: 'a1b2c3d4-1111-4000-8000-000000000004', code: 'ITM-004', name: 'หัวเทียน NGK', unit: 'PCS', category: 'ระบบจุดระเบิด', isActive: true },
    { id: 'a1b2c3d4-1111-4000-8000-000000000005', code: 'ITM-005', name: 'น้ำยาหม้อน้ำ', unit: 'LTR', category: 'น้ำยาหล่อเย็น', isActive: true },
  ]);

  readonly warehouses = signal<MasterWarehouse[]>([
    { id: 'd4e5f6a7-4444-4000-8000-000000000001', code: 'WH-001', name: 'คลังสินค้าหลัก', location: 'อาคาร A ชั้น 1', isActive: true },
    { id: 'd4e5f6a7-4444-4000-8000-000000000002', code: 'WH-002', name: 'คลังสินค้าสำรอง', location: 'อาคาร B ชั้น 1', isActive: true },
    { id: 'd4e5f6a7-4444-4000-8000-000000000003', code: 'WH-003', name: 'คลังสินค้าเสีย', location: 'อาคาร C', isActive: true },
  ]);

  readonly activeVendors = computed(() => this.vendors().filter((v) => v.isActive));
  readonly activeItems = computed(() => this.items().filter((i) => i.isActive));
  readonly activeWarehouses = computed(() => this.warehouses().filter((w) => w.isActive));

  // ── GR/IR Clearing State ─────────────────────────────────

  readonly clearings = signal<GrIrClearing[]>([]);
  readonly clearingsLoading = signal(false);
  readonly clearingsMeta = signal<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // ── Purchasing Actions ───────────────────────────────────

  createGoodsReceipt(dto: GrReceiveRequest, onSuccess?: (res: GrReceiveResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createGoodsReceipt(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(
          `บันทึกรับสินค้าสำเร็จ — TX: ${res.txEntry.id.slice(0, 8)}..., AP: ${res.apOpenItem.originalAmount.toFixed(2)} ฿`
        );
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create goods receipt');
      },
    });
  }

  createGoodsReturn(dto: GrReturnRequest, onSuccess?: (res: GrReturnResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createGoodsReturn(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(
          `บันทึกคืนสินค้าสำเร็จ — Clearing: ${res.clearing.id.slice(0, 8)}..., ยอด: ${res.clearing.clearingAmount.toFixed(2)} ฿`
        );
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create goods return');
      },
    });
  }

  createCnReturn(dto: CnReturnRequest, onSuccess?: (res: CnReturnResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createCnReturn(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(
          `สร้าง CN คืนสินค้าสำเร็จ — ลด AP: ${res.apReduction.reducedAmount.toFixed(2)} ฿, PPV: ${res.clearing.ppvAmount.toFixed(2)} ฿`
        );
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create CN return');
      },
    });
  }

  createCnPriceAdj(dto: CnPriceAdjRequest, onSuccess?: (res: CnPriceAdjResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createCnPriceAdj(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(
          `สร้าง CN ปรับราคาสำเร็จ — ลด AP: ${res.apReduction.reducedAmount.toFixed(2)} ฿`
        );
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create CN price adjustment');
      },
    });
  }

  createCnDebt(dto: CnDebtRequest, onSuccess?: (res: CnDebtResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.createCnDebt(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(
          `สร้าง CN ลดหนี้สำเร็จ — ลด AP: ${res.apReduction.reducedAmount.toFixed(2)} ฿`
        );
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to create CN debt');
      },
    });
  }

  loadClearings(params?: { page?: number; limit?: number; status?: string; vendorId?: string }): void {
    this.clearingsLoading.set(true);

    this.api.getClearings({ ...params, sort: 'createdAt:desc' }).subscribe({
      next: (res) => {
        this.clearings.set(res.data);
        this.clearingsMeta.set(res.meta);
        this.clearingsLoading.set(false);
      },
      error: () => {
        this.clearings.set([]);
        this.clearingsLoading.set(false);
      },
    });
  }

  // ── AP Open Items State ──────────────────────────────────

  readonly apOpenItems = signal<ApOpenItemDetail[]>([]);
  readonly apOpenItemsLoading = signal(false);
  readonly apOpenItemsMeta = signal<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // ── AR Open Items State ──────────────────────────────────

  readonly arOpenItems = signal<ArOpenItemDetail[]>([]);
  readonly arOpenItemsLoading = signal(false);
  readonly arOpenItemsMeta = signal<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // ── Customers (Mock) ─────────────────────────────────────

  readonly customers = signal<MasterCustomer[]>([
    { id: 'c3d4e5f6-3333-4000-8000-000000000001', code: 'CUS-001', name: 'บริษัท เอบีซี จำกัด', taxId: '0105500000010', contactName: 'คุณสมศรี', isActive: true },
    { id: 'c3d4e5f6-3333-4000-8000-000000000002', code: 'CUS-002', name: 'ห้างหุ้นส่วน XYZ', taxId: '0105500000011', contactName: 'คุณวิไล', isActive: true },
    { id: 'c3d4e5f6-3333-4000-8000-000000000003', code: 'CUS-003', name: 'บริษัท สยามมอเตอร์ จำกัด', taxId: '0105500000012', contactName: 'คุณประสิทธิ์', isActive: true },
  ]);

  readonly activeCustomers = computed(() => this.customers().filter((c) => c.isActive));

  // ── AP Actions ───────────────────────────────────────────

  loadApOpenItems(params?: { page?: number; limit?: number; status?: string; vendorId?: string }): void {
    this.apOpenItemsLoading.set(true);

    this.api.getApOpenItems({ ...params, sort: 'createdAt:desc' }).subscribe({
      next: (res) => {
        this.apOpenItems.set(res.data);
        this.apOpenItemsMeta.set(res.meta);
        this.apOpenItemsLoading.set(false);
      },
      error: () => {
        this.apOpenItems.set([]);
        this.apOpenItemsLoading.set(false);
      },
    });
  }

  makeApPayment(dto: MakeApPaymentRequest, onSuccess?: (res: PaymentResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.makeApPayment(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(
          `บันทึกจ่ายเงิน AP สำเร็จ — TX: ${res.txEntry.id.slice(0, 8)}..., จำนวน: ${dto.totalAmount.toFixed(2)} ฿`
        );
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to make AP payment');
      },
    });
  }

  // ── AR Actions ───────────────────────────────────────────

  loadArOpenItems(params?: { page?: number; limit?: number; status?: string; customerId?: string }): void {
    this.arOpenItemsLoading.set(true);

    this.api.getArOpenItems({ ...params, sort: 'createdAt:desc' }).subscribe({
      next: (res) => {
        this.arOpenItems.set(res.data);
        this.arOpenItemsMeta.set(res.meta);
        this.arOpenItemsLoading.set(false);
      },
      error: () => {
        this.arOpenItems.set([]);
        this.arOpenItemsLoading.set(false);
      },
    });
  }

  receiveArPayment(dto: ReceiveArPaymentRequest, onSuccess?: (res: PaymentResponse) => void): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submitSuccess.set(null);

    this.api.receiveArPayment(dto).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.submitSuccess.set(
          `บันทึกรับเงิน AR สำเร็จ — TX: ${res.txEntry.id.slice(0, 8)}..., จำนวน: ${dto.totalAmount.toFixed(2)} ฿`
        );
        onSuccess?.(res);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err.error?.message || 'Failed to receive AR payment');
      },
    });
  }
}
