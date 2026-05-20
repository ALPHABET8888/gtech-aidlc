import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { MasterItem, MasterVendor, MasterWarehouse, MasterCustomer } from '../models';

/**
 * Response shape from the backend paginated endpoints.
 */
interface PaginatedBackendResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** Raw vendor shape from backend (Prisma model) */
interface BackendVendor {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

/** Raw customer shape from backend (Prisma model) */
interface BackendCustomer {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

/** Raw item shape from backend (Prisma model) */
interface BackendItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  isActive: boolean;
}

/** Raw warehouse shape from backend (Prisma model) */
interface BackendWarehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
}

/**
 * HTTP client service for Master Data API.
 * Fetches real data from /api/v1/items, /api/v1/vendors, /api/v1/warehouses, /api/v1/customers.
 */
@Injectable({ providedIn: 'root' })
export class MasterDataApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1';

  /**
   * Fetch all active items from master data.
   */
  getActiveItems(): Observable<MasterItem[]> {
    const params = new HttpParams()
      .set('isActive', 'true')
      .set('pageSize', '1000');

    return this.http
      .get<PaginatedBackendResponse<BackendItem>>(`${this.baseUrl}/items`, { params })
      .pipe(
        map((res) =>
          res.data.map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            unit: item.unit,
            category: item.category ?? '',
            isActive: item.isActive,
          }))
        )
      );
  }

  /**
   * Fetch all active vendors from master data.
   */
  getActiveVendors(): Observable<MasterVendor[]> {
    const params = new HttpParams()
      .set('isActive', 'true')
      .set('pageSize', '1000');

    return this.http
      .get<PaginatedBackendResponse<BackendVendor>>(`${this.baseUrl}/vendors`, { params })
      .pipe(
        map((res) =>
          res.data.map((vendor) => ({
            id: vendor.id,
            code: vendor.code,
            name: vendor.name,
            taxId: vendor.taxId ?? '',
            contactName: vendor.phone ?? '',
            isActive: vendor.isActive,
          }))
        )
      );
  }

  /**
   * Fetch all active warehouses from master data.
   */
  getActiveWarehouses(): Observable<MasterWarehouse[]> {
    const params = new HttpParams()
      .set('isActive', 'true')
      .set('pageSize', '1000');

    return this.http
      .get<PaginatedBackendResponse<BackendWarehouse>>(`${this.baseUrl}/warehouses`, { params })
      .pipe(
        map((res) =>
          res.data.map((wh) => ({
            id: wh.id,
            code: wh.code,
            name: wh.name,
            location: wh.location ?? '',
            isActive: wh.isActive,
          }))
        )
      );
  }

  /**
   * Fetch all active customers from master data.
   */
  getActiveCustomers(): Observable<MasterCustomer[]> {
    const params = new HttpParams()
      .set('isActive', 'true')
      .set('pageSize', '1000');

    return this.http
      .get<PaginatedBackendResponse<BackendCustomer>>(`${this.baseUrl}/customers`, { params })
      .pipe(
        map((res) =>
          res.data.map((customer) => ({
            id: customer.id,
            code: customer.code,
            name: customer.name,
            taxId: customer.taxId ?? '',
            contactName: customer.phone ?? '',
            isActive: customer.isActive,
          }))
        )
      );
  }
}
