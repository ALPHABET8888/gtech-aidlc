import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { signal } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Period, CreatePeriodDto } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class PeriodApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/periods`;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  getAll(): Observable<Period[]> {
    this.loading.set(true);
    this.error.set(null);
    return this.http.get<Period[]>(this.baseUrl).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  create(dto: CreatePeriodDto): Observable<Period> {
    this.loading.set(true);
    this.error.set(null);
    return this.http.post<Period>(this.baseUrl, dto).pipe(
      finalize(() => this.loading.set(false))
    );
  }

  close(id: string): Observable<Period> {
    this.loading.set(true);
    this.error.set(null);
    return this.http.patch<Period>(`${this.baseUrl}/${id}/close`, {}).pipe(
      finalize(() => this.loading.set(false))
    );
  }
}
