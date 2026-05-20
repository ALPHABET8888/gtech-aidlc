import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { BaseApiService } from './base-api.service';
import { User, CreateUserDto, UpdateUserDto } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class UserApiService extends BaseApiService<User, CreateUserDto, UpdateUserDto> {
  protected readonly resourcePath = '/users';

  assignRoles(userId: string, roleIds: string[]): Observable<void> {
    this.loading.set(true);
    return this.http
      .post<void>(`${this.url}/${userId}/roles`, { roleIds })
      .pipe(finalize(() => this.loading.set(false)));
  }

  removeRole(userId: string, roleId: string): Observable<void> {
    this.loading.set(true);
    return this.http
      .delete<void>(`${this.url}/${userId}/roles/${roleId}`)
      .pipe(finalize(() => this.loading.set(false)));
  }
}
