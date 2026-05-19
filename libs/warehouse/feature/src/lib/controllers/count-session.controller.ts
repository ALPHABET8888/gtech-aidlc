import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { StockCountService } from '../services/stock-count.service';
import { CreateCountSessionDto } from '../dto/create-count-session.dto';
import { RecordCountResultDto } from '../dto/record-count-result.dto';
import { CountSessionQueryDto } from '../dto/count-session-query.dto';

@ApiTags('warehouse / stock-count')
@ApiBearerAuth()
@Controller('api/v1/warehouse/count-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CountSessionController {
  constructor(private readonly stockCountService: StockCountService) {}

  @Post()
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'Create a new stock count session — freeze items in warehouse' })
  @ApiResponse({
    status: 201,
    description: 'Count session created with COUNTING status and frozen lines',
  })
  @ApiResponse({ status: 400, description: 'Validation error — missing items' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 409, description: 'Items already frozen in another session' })
  async create(
    @Body() dto: CreateCountSessionDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.stockCountService.initiateCount(dto, user.userId);
  }

  @Get()
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'List count sessions with filters and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of count sessions',
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  async list(@Query() query: CountSessionQueryDto) {
    const { data, total } = await this.stockCountService.listSessions(query);
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
  @ApiOperation({ summary: 'Get count session detail with lines' })
  @ApiParam({ name: 'id', description: 'Count session ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Count session detail with lines' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getById(@Param('id') id: string) {
    return this.stockCountService.getSession(id);
  }

  @Patch(':id/lines/:lineId')
  @Roles(Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'Record physical count result for a line' })
  @ApiParam({ name: 'id', description: 'Count session ID', format: 'uuid' })
  @ApiParam({ name: 'lineId', description: 'Count line ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Count result recorded — returns updated line' })
  @ApiResponse({ status: 400, description: 'Invalid quantity or missing reason code' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Line not found' })
  @ApiResponse({ status: 409, description: 'Session not in COUNTING status' })
  async recordCount(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: RecordCountResultDto,
  ) {
    return this.stockCountService.recordResult(id, lineId, dto);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'Submit count session for approval' })
  @ApiParam({ name: 'id', description: 'Count session ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Session submitted — status changed to PENDING_APPROVAL' })
  @ApiResponse({ status: 400, description: 'Not all lines have been counted' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 409, description: 'Session not in COUNTING status' })
  async submit(@Param('id') id: string) {
    return this.stockCountService.submitForApproval(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO)
  @ApiOperation({ summary: 'Approve count session — POST adjustments and unfreeze' })
  @ApiParam({ name: 'id', description: 'Count session ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Session approved — adjustments posted, items unfrozen, status COMPLETED',
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 409, description: 'Session not in PENDING_APPROVAL status' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.stockCountService.approveCount(id, user.userId);
  }
}
