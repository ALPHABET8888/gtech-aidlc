import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
import { Role } from '@autoflow/shared-types';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '@autoflow/shared-auth';
import { AuthContext } from '@autoflow/shared-types';
import { PeriodService } from '../services/period.service';
import { CreatePeriodDto } from '../dto/create-period.dto';

@ApiTags('Periods')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('periods')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PeriodController {
  constructor(private readonly periodService: PeriodService) {}

  @Get()
  @Roles(Role.MANAGER, Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'List all accounting periods' })
  @ApiResponse({ status: 200, description: 'List of periods' })
  async listPeriods() {
    return this.periodService.listPeriods();
  }

  @Post()
  @Roles(Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Open a new accounting period' })
  @ApiResponse({ status: 201, description: 'Period created' })
  @ApiResponse({ status: 409, description: 'Period already exists' })
  async openPeriod(
    @Body() dto: CreatePeriodDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.periodService.openPeriod(dto.period, user.userId);
  }

  @Patch(':id/close')
  @Roles(Role.CFO, Role.ADMIN)
  @ApiOperation({ summary: 'Close an accounting period' })
  @ApiParam({ name: 'id', description: 'Period UUID' })
  @ApiResponse({ status: 200, description: 'Period closed' })
  @ApiResponse({ status: 404, description: 'Period not found' })
  @ApiResponse({ status: 409, description: 'Period already closed' })
  async closePeriod(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.periodService.closePeriod(id, user.userId);
  }
}
