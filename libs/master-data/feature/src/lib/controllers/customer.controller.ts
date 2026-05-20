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
import { CustomerService } from '../services/customer.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { QueryCustomersDto } from '../dto/query-customers.dto';

@ApiTags('Customers')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Customer code already exists' })
  async create(@Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List customers with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of customers' })
  async findAll(@Query() query: QueryCustomersDto) {
    const filters = {
      code: query.code,
      name: query.name,
      isActive: query.isActive,
    };

    const pagination = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };

    return this.customerService.findAll(filters, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer details' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a customer' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 409, description: 'Customer code already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft-delete a customer (set isActive=false)' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer deactivated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.delete(id);
  }
}
