import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@autoflow/shared-auth';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { IMasterDataQueryService, ItemData, WarehouseData } from '../mocks/interfaces';

/**
 * Controller providing master data lookups for the warehouse UI.
 * Returns items and warehouses for dropdown selections.
 */
@ApiTags('warehouse / master-data')
@ApiBearerAuth()
@Controller('warehouse/master-data')
@UseGuards(JwtAuthGuard)
export class WarehouseMasterDataController {
  constructor(
    @Inject(WAREHOUSE_DI_TOKENS.MASTER_DATA_QUERY_SERVICE)
    private readonly masterDataService: IMasterDataQueryService,
  ) {}

  @Get('items')
  @ApiOperation({ summary: 'List all active items for warehouse operations' })
  @ApiResponse({ status: 200, description: 'List of items' })
  async getItems(): Promise<ItemData[]> {
    return this.masterDataService.listItems();
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'List all active warehouses' })
  @ApiResponse({ status: 200, description: 'List of warehouses' })
  async getWarehouses(): Promise<WarehouseData[]> {
    return this.masterDataService.listWarehouses();
  }
}
