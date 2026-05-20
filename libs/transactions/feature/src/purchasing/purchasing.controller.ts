import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@autoflow/shared-auth';
import { Role } from '@autoflow/shared-types';
import {
  CreateGoodsReceiptDto,
  CreateGoodsReturnDto,
  CreateGrReplacementDto,
  CreateCnReturnDto,
  CreateCnPriceAdjDto,
  CreateCnDebtDto,
} from '../dto/purchasing';
import { GoodsReceiptService } from './goods-receipt.service';
import { PurchaseCnService } from './purchase-cn.service';

/**
 * PurchasingController — REST endpoints for Purchasing GR + CN flows.
 * Base path: /api/v1/transactions/purchasing
 */
@ApiTags('Purchasing')
@ApiBearerAuth('bearer')
@Controller('api/v1/transactions/purchasing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasingController {
  constructor(
    private readonly goodsReceiptService: GoodsReceiptService,
    private readonly purchaseCnService: PurchaseCnService,
  ) {}

  /**
   * POST /purchasing/gr-receive
   * Record Goods Receipt (GR_RECEIVE) — stock increase + MA + AP creation.
   * Auth: Store Staff+
   * Stories: US-015
   */
  @Post('gr-receive')
  @Roles(Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record Goods Receipt (GR_RECEIVE)' })
  @ApiResponse({ status: 201, description: 'Goods receipt recorded — stock increase + MA recalculation + AP open item created' })
  @ApiResponse({ status: 400, description: 'Missing taxInvoiceNo or validation error' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Period locked or insufficient role' })
  async createGoodsReceipt(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.goodsReceiptService.createGoodsReceipt(dto, user.userId);
  }

  /**
   * POST /purchasing/gr-return
   * Return goods to supplier (GR_RETURN) — stock decrease + clearing open.
   * Auth: Supervisor+
   * Stories: US-016
   */
  @Post('gr-return')
  @Roles(Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Return goods to supplier (GR_RETURN)' })
  @ApiResponse({ status: 201, description: 'Goods return recorded — stock decrease + GR/IR clearing opened' })
  @ApiResponse({ status: 400, description: 'Invalid GR reference' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 409, description: 'GR already fully returned' })
  @ApiResponse({ status: 422, description: 'Stock insufficient for return' })
  async createGoodsReturn(
    @Body() dto: CreateGoodsReturnDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.goodsReceiptService.createGoodsReturn(dto, user.userId);
  }

  /**
   * POST /purchasing/gr-replacement
   * Receive replacement goods (GR_REPLACEMENT) — stock from clearing + clearing close.
   * Auth: Store Staff+
   * Stories: US-017
   */
  @Post('gr-replacement')
  @Roles(Role.STORE, Role.SUPERVISOR, Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Receive replacement goods (GR_REPLACEMENT)' })
  @ApiResponse({ status: 201, description: 'Replacement received — stock from clearing + clearing closed' })
  @ApiResponse({ status: 400, description: 'Invalid clearing reference' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 409, description: 'Clearing already closed' })
  async receiveReplacement(
    @Body() dto: CreateGrReplacementDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.goodsReceiptService.receiveReplacement(dto, user.userId);
  }

  /**
   * POST /purchasing/cn-return
   * Purchase CN for returned goods (CN_RETURN) — AP reduction + PPV + clearing close.
   * CN_RETURN must NOT touch inventory.
   * Auth: Manager+
   * Stories: US-018
   */
  @Post('cn-return')
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Purchase CN for returned goods (CN_RETURN)' })
  @ApiResponse({ status: 201, description: 'CN_RETURN created — AP reduction + PPV calculated + clearing closed' })
  @ApiResponse({ status: 400, description: 'Invalid references' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Manager+ required' })
  @ApiResponse({ status: 409, description: 'Clearing already closed' })
  async createCnReturn(
    @Body() dto: CreateCnReturnDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.purchaseCnService.createCnReturn(dto, user.userId);
  }

  /**
   * POST /purchasing/cn-price-adj
   * Purchase CN for price adjustment (CN_PRICE_ADJ) — inventory + AP adjustment.
   * Auth: Manager+
   * Stories: US-019
   */
  @Post('cn-price-adj')
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Purchase CN for price adjustment (CN_PRICE_ADJ)' })
  @ApiResponse({ status: 201, description: 'CN_PRICE_ADJ created — inventory + AP adjustment + MA recalculation' })
  @ApiResponse({ status: 400, description: 'Invalid GR reference' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Period locked or insufficient role' })
  async createCnPriceAdj(
    @Body() dto: CreateCnPriceAdjDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.purchaseCnService.createCnPriceAdj(dto, user.userId);
  }

  /**
   * POST /purchasing/cn-debt
   * Purchase CN debt only (AP_CN_DEBT) — AP reduction only, requires reason.
   * Auth: Manager+
   * Stories: US-020
   */
  @Post('cn-debt')
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Purchase CN debt only (AP_CN_DEBT)' })
  @ApiResponse({ status: 201, description: 'AP_CN_DEBT created — AP reduction only' })
  @ApiResponse({ status: 400, description: 'No reason provided or invalid reference' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Insufficient role — Manager+ required' })
  async createCnDebt(
    @Body() dto: CreateCnDebtDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.purchaseCnService.createCnDebt(dto, user.userId);
  }
}
