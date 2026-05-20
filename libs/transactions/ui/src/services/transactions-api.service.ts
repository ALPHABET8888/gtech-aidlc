import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  JobOrder,
  CreateJobOrderRequest,
  UpdateJoStatusRequest,
  IssueTempDoRequest,
  IssueInvoiceRequest,
  InvoiceResponse,
  CreateSalesReturnRequest,
  CreateSalesPriceAdjRequest,
  SalesCnResponse,
  PaginatedResponse,
  GrReceiveRequest,
  GrReceiveResponse,
  GrReturnRequest,
  GrReturnResponse,
  GrReplacementRequest,
  GrReplacementResponse,
  CnReturnRequest,
  CnReturnResponse,
  CnPriceAdjRequest,
  CnPriceAdjResponse,
  CnDebtRequest,
  CnDebtResponse,
  GrIrClearing,
  MakeApPaymentRequest,
  ReceiveArPaymentRequest,
  PaymentResponse,
  ApOpenItemDetail,
  ArOpenItemDetail,
} from '../models';

/**
 * HTTP client service for the Transactions API.
 * Handles all REST calls to /api/v1/transactions/ endpoints.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/transactions';

  // ── Job Orders ───────────────────────────────────────────

  getJobOrders(params?: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
    sort?: string;
  }): Observable<PaginatedResponse<JobOrder>> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.customerId) httpParams = httpParams.set('customerId', params.customerId);
    if (params?.sort) httpParams = httpParams.set('sort', params.sort);

    return this.http.get<PaginatedResponse<JobOrder>>(
      `${this.baseUrl}/job-orders`,
      { params: httpParams }
    );
  }

  getJobOrder(id: string): Observable<JobOrder> {
    return this.http.get<JobOrder>(`${this.baseUrl}/job-orders/${id}`);
  }

  createJobOrder(dto: CreateJobOrderRequest): Observable<JobOrder> {
    return this.http.post<JobOrder>(`${this.baseUrl}/job-orders`, dto);
  }

  updateJobOrderStatus(id: string, dto: UpdateJoStatusRequest): Observable<JobOrder> {
    return this.http.patch<JobOrder>(`${this.baseUrl}/job-orders/${id}/status`, dto);
  }

  // ── Invoice / TEMP_DO ────────────────────────────────────

  issueTempDo(joId: string, dto: IssueTempDoRequest): Observable<InvoiceResponse> {
    return this.http.post<InvoiceResponse>(
      `${this.baseUrl}/job-orders/${joId}/temp-do`,
      dto
    );
  }

  issueInvoice(joId: string, dto: IssueInvoiceRequest): Observable<InvoiceResponse> {
    return this.http.post<InvoiceResponse>(
      `${this.baseUrl}/job-orders/${joId}/invoice`,
      dto
    );
  }

  // ── Sales CN ─────────────────────────────────────────────

  createSalesReturn(dto: CreateSalesReturnRequest): Observable<SalesCnResponse> {
    return this.http.post<SalesCnResponse>(
      `${this.baseUrl}/sales-cn/return`,
      dto
    );
  }

  createSalesPriceAdj(dto: CreateSalesPriceAdjRequest): Observable<SalesCnResponse> {
    return this.http.post<SalesCnResponse>(
      `${this.baseUrl}/sales-cn/price-adj`,
      dto
    );
  }

  // ── Purchasing: Goods Receipt ────────────────────────────

  createGoodsReceipt(dto: GrReceiveRequest): Observable<GrReceiveResponse> {
    return this.http.post<GrReceiveResponse>(
      `${this.baseUrl}/purchasing/gr-receive`,
      dto
    );
  }

  createGoodsReturn(dto: GrReturnRequest): Observable<GrReturnResponse> {
    return this.http.post<GrReturnResponse>(
      `${this.baseUrl}/purchasing/gr-return`,
      dto
    );
  }

  createGrReplacement(dto: GrReplacementRequest): Observable<GrReplacementResponse> {
    return this.http.post<GrReplacementResponse>(
      `${this.baseUrl}/purchasing/gr-replacement`,
      dto
    );
  }

  // ── Purchasing: Credit Notes ─────────────────────────────

  createCnReturn(dto: CnReturnRequest): Observable<CnReturnResponse> {
    return this.http.post<CnReturnResponse>(
      `${this.baseUrl}/purchasing/cn-return`,
      dto
    );
  }

  createCnPriceAdj(dto: CnPriceAdjRequest): Observable<CnPriceAdjResponse> {
    return this.http.post<CnPriceAdjResponse>(
      `${this.baseUrl}/purchasing/cn-price-adj`,
      dto
    );
  }

  createCnDebt(dto: CnDebtRequest): Observable<CnDebtResponse> {
    return this.http.post<CnDebtResponse>(
      `${this.baseUrl}/purchasing/cn-debt`,
      dto
    );
  }

  // ── GR/IR Clearing ───────────────────────────────────────

  getClearings(params?: {
    page?: number;
    limit?: number;
    status?: string;
    vendorId?: string;
    sort?: string;
  }): Observable<PaginatedResponse<GrIrClearing>> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.vendorId) httpParams = httpParams.set('vendorId', params.vendorId);
    if (params?.sort) httpParams = httpParams.set('sort', params.sort);

    return this.http.get<PaginatedResponse<GrIrClearing>>(
      `${this.baseUrl}/purchasing/clearings`,
      { params: httpParams }
    );
  }

  // ── AP Open Items ────────────────────────────────────────

  getApOpenItems(params?: {
    page?: number;
    limit?: number;
    status?: string;
    vendorId?: string;
    sort?: string;
  }): Observable<PaginatedResponse<ApOpenItemDetail>> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.vendorId) httpParams = httpParams.set('vendorId', params.vendorId);
    if (params?.sort) httpParams = httpParams.set('sort', params.sort);

    return this.http.get<PaginatedResponse<ApOpenItemDetail>>(
      `${this.baseUrl}/ap/open-items`,
      { params: httpParams }
    );
  }

  makeApPayment(dto: MakeApPaymentRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(
      `${this.baseUrl}/ap/payments`,
      dto
    );
  }

  // ── AR Open Items ────────────────────────────────────────

  getArOpenItems(params?: {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
    sort?: string;
  }): Observable<PaginatedResponse<ArOpenItemDetail>> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page.toString());
    if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.customerId) httpParams = httpParams.set('customerId', params.customerId);
    if (params?.sort) httpParams = httpParams.set('sort', params.sort);

    return this.http.get<PaginatedResponse<ArOpenItemDetail>>(
      `${this.baseUrl}/ar/open-items`,
      { params: httpParams }
    );
  }

  receiveArPayment(dto: ReceiveArPaymentRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(
      `${this.baseUrl}/ar/payments`,
      dto
    );
  }
}
