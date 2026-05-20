import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { Customer, CreateCustomerDto, UpdateCustomerDto } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class CustomerApiService extends BaseApiService<Customer, CreateCustomerDto, UpdateCustomerDto> {
  protected readonly resourcePath = '/customers';
}
