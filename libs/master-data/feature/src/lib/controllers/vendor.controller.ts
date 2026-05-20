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
import { VendorService } from '../services/vendor.service';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';
import { QueryVendorsDto } from '../dto/query-vendors.dto';

@ApiTags('Vendors')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new vendor' })
  @ApiResponse({ status: 201, description: 'Vendor created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Vendor code already exists' })
  async create(@Body() dto: CreateVendorDto) {
    return this.vendorService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List vendors with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of vendors' })
  async findAll(@Query() query: QueryVendorsDto) {
    const filters = {
      code: query.code,
      name: query.name,
      isActive: query.isActive,
    };

    const pagination = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };

    return this.vendorService.findAll(filters, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vendor by ID' })
  @ApiParam({ name: 'id', description: 'Vendor UUID' })
  @ApiResponse({ status: 200, description: 'Vendor details' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a vendor' })
  @ApiParam({ name: 'id', description: 'Vendor UUID' })
  @ApiResponse({ status: 200, description: 'Vendor updated successfully' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  @ApiResponse({ status: 409, description: 'Vendor code already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft-delete a vendor (set isActive=false)' })
  @ApiParam({ name: 'id', description: 'Vendor UUID' })
  @ApiResponse({ status: 200, description: 'Vendor deactivated' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorService.delete(id);
  }
}
