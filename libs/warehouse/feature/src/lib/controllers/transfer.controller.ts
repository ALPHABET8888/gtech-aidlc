import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@autoflow/shared-auth';
import { AuthContext, Role } from '@autoflow/shared-types';
import { StockTransferService } from '../services/stock-transfer.service';
import { CreateTransferDto } from '../dto/create-transfer.dto';
import { TransferQueryDto } from '../dto/transfer-query.dto';

@ApiTags('warehouse / stock-transfer')
@ApiBearerAuth()
@Controller('api/v1/warehouse/transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransferController {
  constructor(private readonly stockTransferService: StockTransferService) {}

  @Post()
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'Create and POST a stock transfer between warehouses (atomic)' })
  @ApiResponse({
    status: 201,
    description: 'Transfer order created and posted — stock moved atomically',
  })
  @ApiResponse({ status: 400, description: 'Validation error — same warehouse or missing lines' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 422, description: 'Insufficient stock at source warehouse' })
  async create(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.stockTransferService.initiateTransfer(dto, user.userId);
  }

  @Get()
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.STORE)
  @ApiOperation({ summary: 'List transfer orders with filters and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of transfer orders',
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  async list(@Query() query: TransferQueryDto) {
    const { data, total } = await this.stockTransferService.listTransfers(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  @Get(':id')
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.STORE)
  @ApiOperation({ summary: 'Get transfer order detail with lines' })
  @ApiParam({ name: 'id', description: 'Transfer order ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Transfer order detail with lines' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Transfer order not found' })
  async getById(@Param('id') id: string) {
    return this.stockTransferService.getTransfer(id);
  }
}
