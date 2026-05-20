import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { Vendor, CreateVendorDto, UpdateVendorDto } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class VendorApiService extends BaseApiService<Vendor, CreateVendorDto, UpdateVendorDto> {
  protected readonly resourcePath = '/vendors';
}
