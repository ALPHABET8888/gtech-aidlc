import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { JwtAuthGuard, RolesGuard, Roles } from '@autoflow/shared-auth';
import { WarehouseService } from '../services/warehouse.service';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { QueryWarehousesDto } from '../dto/query-warehouses.dto';

@ApiTags('Warehouses')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new warehouse' })
  @ApiResponse({ status: 201, description: 'Warehouse created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Warehouse code already exists' })
  async create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List warehouses with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of warehouses' })
  async findAll(@Query() query: QueryWarehousesDto) {
    const filters = {
      code: query.code,
      name: query.name,
      location: query.location,
      isActive: query.isActive,
    };

    const pagination = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };

    return this.warehouseService.findAll(filters, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get warehouse by ID' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Warehouse details' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Warehouse updated successfully' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  @ApiResponse({ status: 409, description: 'Warehouse code already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouseService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft-delete a warehouse (set isActive=false)' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Warehouse deactivated' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.delete(id);
  }
}
