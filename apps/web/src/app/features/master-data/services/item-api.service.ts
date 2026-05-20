import { Injectable } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { Item, CreateItemDto, UpdateItemDto } from '../models/master-data.models';

@Injectable({ providedIn: 'root' })
export class ItemApiService extends BaseApiService<Item, CreateItemDto, UpdateItemDto> {
  protected readonly resourcePath = '/items';
}
