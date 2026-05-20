import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { Warehouse, CreateWarehouseDto, UpdateWarehouseDto } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class WarehouseApiService extends BaseApiService<Warehouse, CreateWarehouseDto, UpdateWarehouseDto> {
  protected readonly resourcePath = '/warehouses';
}
