import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '@autoflow/shared-auth';
import { StockBalanceService } from '../services/stock-balance.service';
import { QueryStockBalanceDto } from '../dto/query-stock-balance.dto';

@ApiTags('Stock Balance')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('stock-balance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockBalanceController {
  constructor(private readonly stockBalanceService: StockBalanceService) {}

  @Get()
  @ApiOperation({ summary: 'List stock balances with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of stock balances' })
  async findAll(@Query() query: QueryStockBalanceDto) {
    const filters = {
      itemId: query.itemId,
      warehouseId: query.warehouseId,
    };

    const pagination = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };

    return this.stockBalanceService.findAll(filters, pagination);
  }

  @Get(':itemId/:warehouseId')
  @ApiOperation({ summary: 'Get specific stock balance for item + warehouse pair' })
  @ApiParam({ name: 'itemId', description: 'Item UUID' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Stock balance details' })
  @ApiResponse({ status: 404, description: 'Stock balance not found' })
  async findByItemAndWarehouse(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
  ) {
    return this.stockBalanceService.findByItemAndWarehouse(itemId, warehouseId);
  }
}
