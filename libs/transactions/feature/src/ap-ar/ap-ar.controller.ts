import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@autoflow/shared-auth';
import { Role, AuthContext } from '@autoflow/shared-types';
import { ApArStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApService } from './ap.service';
import { ArService } from './ar.service';
import { PaymentMatchingService } from './payment-matching.service';
import { MakeApPaymentDto, ReceiveArPaymentDto } from '../dto/ap-ar';
import { PaginationQueryDto, PaginatedResponseDto } from '../dto/shared';

/**
 * Query DTO for listing AP open items with filters.
 */
export class ListApOpenItemsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsEnum(ApArStatus)
  status?: ApArStatus;
}

/**
 * Query DTO for listing AR open items with filters.
 */
export class ListArOpenItemsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(ApArStatus)
  status?: ApArStatus;
}

/**
 * ApArController — REST endpoints for AP/AR payment and open item listing.
 * Base path: /api/v1/transactions
 *
 * Endpoints:
 * - POST /ap/payments — Record AP payment (Manager+)
 * - POST /ar/payments — Record AR payment (Cashier+)
 * - GET /ap/open-items — List AP open items (Manager+)
 * - GET /ar/open-items — List AR open items (Cashier+)
 */
@ApiTags('AP/AR — Payments & Open Items')
@ApiBearerAuth('bearer')
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApArController {
  constructor(
    private readonly apService: ApService,
    private readonly arService: ArService,
    private readonly paymentMatchingService: PaymentMatchingService,
  ) {}

  /**
   * POST /ap/payments — Record AP payment with manual matching.
   * Auth: Manager+
   * Stories: US-021
   */
  @Post('ap/payments')
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record AP payment with manual matching' })
  @ApiResponse({ status: 201, description: 'AP payment recorded — allocations applied to open items' })
  @ApiResponse({ status: 400, description: 'Allocation sum ≠ totalAmount' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Manager+ required' })
  @ApiResponse({ status: 422, description: 'Payment exceeds open balance' })
  async makeApPayment(
    @Body() dto: MakeApPaymentDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.paymentMatchingService.makeApPayment(dto, user.userId);
  }

  /**
   * POST /ar/payments — Record AR payment with manual matching.
   * Auth: Cashier+
   * Stories: US-014
   */
  @Post('ar/payments')
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record AR payment with manual matching' })
  @ApiResponse({ status: 201, description: 'AR payment recorded — allocations applied to open items' })
  @ApiResponse({ status: 400, description: 'Allocation sum ≠ totalAmount' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 422, description: 'Payment exceeds open balance' })
  async receiveArPayment(
    @Body() dto: ReceiveArPaymentDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.paymentMatchingService.receiveArPayment(dto, user.userId);
  }

  /**
   * GET /ap/open-items — List AP open items for payment matching UI.
   * Auth: Manager+
   * Stories: US-021, US-026
   */
  @Get('ap/open-items')
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'List AP open items for payment matching' })
  @ApiResponse({ status: 200, description: 'Paginated list of AP open items' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Manager+ required' })
  async listApOpenItems(@Query() query: ListApOpenItemsQueryDto) {
    return this.apService.getOpenApItems({
      vendorId: query.vendorId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }

  /**
   * GET /ar/open-items — List AR open items for payment matching UI.
   * Auth: Cashier+
   * Stories: US-014, US-027
   */
  @Get('ar/open-items')
  @Roles(Role.CASHIER, Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'List AR open items for payment matching' })
  @ApiResponse({ status: 200, description: 'Paginated list of AR open items' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async listArOpenItems(@Query() query: ListArOpenItemsQueryDto) {
    return this.arService.getOpenArItems({
      customerId: query.customerId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }
}
