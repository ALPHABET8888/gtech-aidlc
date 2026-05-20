import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { signal } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { StockBalance, PaginatedResponse, PaginationParams } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class StockBalanceApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/stock-balance`;

  readonly loading = signal(false);

  getAll(params?: PaginationParams & { itemId?: string; warehouseId?: string }): Observable<PaginatedResponse<StockBalance>> {
    this.loading.set(true);

    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return this.http.get<PaginatedResponse<StockBalance>>(this.baseUrl, { params: httpParams }).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  getByItemWarehouse(itemId: string, warehouseId: string): Observable<StockBalance> {
    this.loading.set(true);
    return this.http.get<StockBalance>(`${this.baseUrl}/${itemId}/${warehouseId}`).pipe(
      finalize(() => this.loading.set(false))
    );
  }
}
