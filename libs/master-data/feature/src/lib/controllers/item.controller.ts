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
import { ItemService } from '../services/item.service';
import { CreateItemDto } from '../dto/create-item.dto';
import { UpdateItemDto } from '../dto/update-item.dto';
import { QueryItemsDto } from '../dto/query-items.dto';

@ApiTags('Items')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: 201, description: 'Item created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Item code already exists' })
  async create(@Body() dto: CreateItemDto) {
    return this.itemService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List items with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of items' })
  async findAll(@Query() query: QueryItemsDto) {
    const filters = {
      code: query.code,
      name: query.name,
      category: query.category,
      isActive: query.isActive,
    };

    const pagination = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };

    return this.itemService.findAll(filters, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item details' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an item' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item updated successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 409, description: 'Item code already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.itemService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft-delete an item (set isActive=false)' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item deactivated' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemService.delete(id);
  }
}
