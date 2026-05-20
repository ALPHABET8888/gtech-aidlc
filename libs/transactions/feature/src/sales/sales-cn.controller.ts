import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@autoflow/shared-auth';
import { Role, AuthContext } from '@autoflow/shared-types';
import { SalesCnService, SalesCnReturnResult, SalesCnPriceAdjResult } from './sales-cn.service';
import { CreateSalesReturnDto, CreateSalesPriceAdjDto } from '../dto';

/**
 * SalesCnController — handles Sales Credit Note endpoints.
 * Base path: /api/v1/transactions/sales-cn
 *
 * POST /sales-cn/return — CN_SALES_RETURN (Supervisor+)
 * POST /sales-cn/price-adj — CN_SALES_PRICE (Manager+)
 *
 * Stories: US-012, US-013
 */
@ApiTags('Sales — Credit Notes')
@ApiBearerAuth('bearer')
@Controller('transactions/sales-cn')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesCnController {
  constructor(private readonly salesCnService: SalesCnService) {}

  /**
   * POST /sales-cn/return — Create Sales Return CN (CN_SALES_RETURN)
   * Auth: Supervisor+
   * Stories: US-012
   *
   * condition='good': stock returns to warehouse (stock increase + MA recalculation)
   * condition='damaged_total': stock goes to loss (no stock increase, no MA change)
   * Both reduce the AR Open Item via ArService.reduceArByCn()
   */
  @Post('return')
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Create Sales Return CN (CN_SALES_RETURN)' })
  @ApiResponse({ status: 201, description: 'Sales return CN created — TX entry + AR reduction' })
  @ApiResponse({ status: 400, description: 'Invalid invoice reference' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Supervisor+ required' })
  @ApiResponse({ status: 422, description: 'Return qty exceeds sale qty' })
  async createSalesReturn(
    @Body() dto: CreateSalesReturnDto,
    @CurrentUser() user: AuthContext,
  ): Promise<SalesCnReturnResult> {
    return this.salesCnService.createSalesReturn(dto, user.userId);
  }

  /**
   * POST /sales-cn/price-adj — Create Sales Price Adjustment CN (CN_SALES_PRICE)
   * Auth: Manager+
   * Stories: US-013
   *
   * AR reduction only, no inventory impact.
   * Requires reason + Manager approval (DRAFT→POSTED).
   */
  @Post('price-adj')
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Create Sales Price Adjustment CN (CN_SALES_PRICE)' })
  @ApiResponse({ status: 201, description: 'Sales price adjustment CN created — AR reduction only' })
  @ApiResponse({ status: 400, description: 'No reason provided or invalid invoice reference' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Manager+ required' })
  async createSalesPriceAdj(
    @Body() dto: CreateSalesPriceAdjDto,
    @CurrentUser() user: AuthContext,
  ): Promise<SalesCnPriceAdjResult> {
    return this.salesCnService.createSalesPriceAdj(dto, user.userId);
  }
}
