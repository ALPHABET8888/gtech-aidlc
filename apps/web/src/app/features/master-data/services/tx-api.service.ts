import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { signal } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { TxLog, TxLogQueryParams, PaginatedResponse } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class TxApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tx`;

  readonly loading = signal(false);

  getAll(params?: TxLogQueryParams): Observable<PaginatedResponse<TxLog>> {
    this.loading.set(true);

    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return this.http.get<PaginatedResponse<TxLog>>(this.baseUrl, { params: httpParams }).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  getById(id: string): Observable<TxLog> {
    this.loading.set(true);
    return this.http.get<TxLog>(`${this.baseUrl}/${id}`).pipe(
      finalize(() => this.loading.set(false))
    );
  }
}
