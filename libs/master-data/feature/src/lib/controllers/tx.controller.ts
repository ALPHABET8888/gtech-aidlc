import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@autoflow/shared-types';
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  CurrentUser,
} from '@autoflow/shared-auth';
import { AuthContext } from '@autoflow/shared-types';
import { TxLogService } from '../services/tx-log.service';
import { VoidService } from '../services/void.service';
import { ApprovalService } from '../services/approval.service';
import { CreateTxDto } from '../dto/create-tx.dto';
import { VoidTxDto } from '../dto/void-tx.dto';
import { QueryTxDto } from '../dto/query-tx.dto';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { ApprovalGuard } from '../guards/approval.guard';
import { RequiresApproval } from '../decorators/requires-approval.decorator';

@ApiTags('TX Engine')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('tx')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TxController {
  constructor(
    private readonly txLogService: TxLogService,
    private readonly txLogRepository: TxLogRepository,
    private readonly voidService: VoidService,
    private readonly approvalService: ApprovalService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create and POST a new transaction',
    description:
      'Runs the full validation pipeline: Period check → Stock check → RefChain check → MA calculation → POST',
  })
  @ApiResponse({ status: 201, description: 'Transaction created and posted' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — period locked or immutable TX',
  })
  @ApiResponse({ status: 422, description: 'Stock negative' })
  async createTx(
    @Body() dto: CreateTxDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.txLogService.createTx(dto, user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Query TX Log with pagination and filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of transactions',
  })
  async listTx(@Query() query: QueryTxDto) {
    const filters = {
      txType: query.txType,
      txStatus: query.txStatus,
      period: query.period,
      itemId: query.itemId,
      warehouseId: query.warehouseId,
    };

    const pagination = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };

    return this.txLogRepository.findMany(filters, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single transaction by ID' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTx(@Param('id', ParseUUIDPipe) id: string) {
    return this.txLogService.getTx(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequiresApproval(Role.MANAGER, Role.CFO, Role.ADMIN)
  @UseGuards(ApprovalGuard)
  @ApiOperation({
    summary: 'Approve a DRAFT transaction',
    description:
      'Transitions a DRAFT transaction to POSTED status. Requires Manager+ role.',
  })
  @ApiParam({ name: 'id', description: 'Transaction UUID to approve' })
  @ApiResponse({
    status: 200,
    description: 'Transaction approved — status set to POSTED',
  })
  @ApiResponse({ status: 403, description: 'Insufficient role for approval' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({
    status: 409,
    description: 'Transaction is not in DRAFT status',
  })
  async approveTx(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.approvalService.approveTx(id, user);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({
    summary: 'VOID a POSTED transaction',
    description:
      'Creates a reverse TX entry to void the original. Requires Manager+ role.',
  })
  @ApiParam({ name: 'id', description: 'Transaction UUID to void' })
  @ApiResponse({
    status: 201,
    description: 'Reverse TX created — original set to VOIDED',
  })
  @ApiResponse({ status: 400, description: 'No reason provided' })
  @ApiResponse({ status: 403, description: 'Insufficient role' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({
    status: 409,
    description: 'Transaction is not in POSTED status',
  })
  async voidTx(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidTxDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.voidService.voidTransaction(id, dto.reason, user);
  }
}
