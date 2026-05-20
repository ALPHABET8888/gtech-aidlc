import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, signal } from '@angular/core';
import { Observable, tap, finalize } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PaginatedResponse, PaginationParams } from '../models/master-data.models';

/**
 * Base API service providing common CRUD operations with Signal-based loading state.
 * Subclass and set `resourcePath` to configure the endpoint.
 */
export abstract class BaseApiService<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  protected readonly http = inject(HttpClient);
  protected readonly baseUrl = environment.apiBaseUrl;

  /** Override in subclass: e.g. '/items' */
  protected abstract readonly resourcePath: string;

  /** Loading state signal */
  readonly loading = signal(false);

  /** Error state signal */
  readonly error = signal<string | null>(null);

  protected get url(): string {
    return `${this.baseUrl}${this.resourcePath}`;
  }

  getAll(params?: PaginationParams & Record<string, unknown>): Observable<PaginatedResponse<T>> {
    this.loading.set(true);
    this.error.set(null);

    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return this.http.get<PaginatedResponse<T>>(this.url, { params: httpParams }).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  getById(id: string): Observable<T> {
    this.loading.set(true);
    this.error.set(null);

    return this.http.get<T>(`${this.url}/${id}`).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  create(dto: TCreate): Observable<T> {
    this.loading.set(true);
    this.error.set(null);

    return this.http.post<T>(this.url, dto).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  update(id: string, dto: TUpdate): Observable<T> {
    this.loading.set(true);
    this.error.set(null);

    return this.http.patch<T>(`${this.url}/${id}`, dto).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  delete(id: string): Observable<void> {
    this.loading.set(true);
    this.error.set(null);

    return this.http.delete<void>(`${this.url}/${id}`).pipe(
      finalize(() => this.loading.set(false))
    );
  }
}
