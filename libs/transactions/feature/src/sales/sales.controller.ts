import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@autoflow/shared-auth';
import { Role, AuthContext } from '@autoflow/shared-types';
import { JobOrderService } from './job-order.service';
import { InvoiceService, InvoiceResult } from './invoice.service';
import {
  CreateJobOrderDto,
  UpdateJoStatusDto,
  IssueTempDoDto,
  IssueInvoiceDto,
  PaginationQueryDto,
  PaginatedResponseDto,
} from '../dto';
import { JobOrder, JOStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Query DTO for listing Job Orders with filters.
 */
export class ListJobOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(JOStatus)
  status?: JOStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

/**
 * SalesController — handles Job Order endpoints.
 * Base path: /api/v1/transactions/job-orders
 */
@ApiTags('Sales — Job Orders')
@ApiBearerAuth('bearer')
@Controller('transactions/job-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly jobOrderService: JobOrderService,
    private readonly invoiceService: InvoiceService,
  ) {}

  /**
   * POST /job-orders — Create a new Job Order
   * Auth: Cashier+
   */
  @Post()
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new Job Order' })
  @ApiResponse({ status: 201, description: 'Job Order created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  async createJobOrder(
    @Body() dto: CreateJobOrderDto,
    @CurrentUser() user: AuthContext,
  ): Promise<JobOrder> {
    return this.jobOrderService.createJobOrder(dto, user.userId);
  }

  /**
   * GET /job-orders — List Job Orders with pagination + filters
   * Auth: Cashier+
   */
  @Get()
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'List Job Orders with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of Job Orders' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async listJobOrders(
    @Query() query: ListJobOrdersQueryDto,
  ): Promise<PaginatedResponseDto<JobOrder>> {
    return this.jobOrderService.findMany({
      status: query.status,
      customerId: query.customerId,
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * GET /job-orders/:id — Get Job Order detail
   * Auth: Cashier+
   */
  @Get(':id')
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Get Job Order detail by ID' })
  @ApiResponse({ status: 200, description: 'Job Order detail' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'Job Order not found' })
  async getJobOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobOrder> {
    return this.jobOrderService.findById(id);
  }

  /**
   * PATCH /job-orders/:id/status — Update JO status (state machine)
   * Auth: Cashier+
   */
  @Patch(':id/status')
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Update Job Order status (OPEN → IN_PROGRESS → DONE)' })
  @ApiResponse({ status: 200, description: 'Job Order status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'Job Order not found' })
  async updateJobOrderStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJoStatusDto,
  ): Promise<JobOrder> {
    return this.jobOrderService.updateStatus(id, dto);
  }

  /**
   * POST /job-orders/:joId/temp-do — Issue TEMP_DO from completed JO (Path A)
   * Auth: Cashier+
   * Stories: US-009
   */
  @Post(':joId/temp-do')
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Issue TEMP_DO from completed Job Order (Path A)' })
  @ApiResponse({ status: 201, description: 'TEMP_DO issued — TX entry + AR open item created' })
  @ApiResponse({ status: 400, description: 'Job Order not in DONE status' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 409, description: 'Job Order already has TEMP_DO' })
  @ApiResponse({ status: 422, description: 'Stock insufficient' })
  async issueTempDo(
    @Param('joId', ParseUUIDPipe) joId: string,
    @Body() dto: IssueTempDoDto,
    @CurrentUser() user: AuthContext,
  ): Promise<InvoiceResult> {
    return this.invoiceService.issueTempDO(joId, dto, user.userId);
  }

  /**
   * POST /job-orders/:joId/invoice — Issue Invoice (auto-determines INVOICE_FROM_DO or SALE_INVOICE)
   * Auth: Cashier+
   * Stories: US-010, US-011
   */
  @Post(':joId/invoice')
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Issue Invoice (auto-determines INVOICE_FROM_DO or SALE_INVOICE)' })
  @ApiResponse({ status: 201, description: 'Invoice issued — TX entry + AR open item created' })
  @ApiResponse({ status: 400, description: 'Job Order not in DONE status' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 409, description: 'Job Order already has invoice' })
  @ApiResponse({ status: 422, description: 'Stock insufficient' })
  async issueInvoice(
    @Param('joId', ParseUUIDPipe) joId: string,
    @Body() dto: IssueInvoiceDto,
    @CurrentUser() user: AuthContext,
  ): Promise<InvoiceResult> {
    return this.invoiceService.issueInvoice(joId, dto, user.userId);
  }
}
