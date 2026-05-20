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
import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { QueryUsersDto } from '../dto/query-users.dto';
import { AssignRolesDto } from '../dto/assign-roles.dto';

@ApiTags('Users')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT token' })
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update a user (upsert by username)' })
  @ApiResponse({ status: 201, description: 'User created or updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already belongs to another user' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List users with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of users' })
  async findAll(@Query() query: QueryUsersDto) {
    const filters = {
      username: query.username,
      fullName: query.fullName,
      isActive: query.isActive,
    };

    const pagination = {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };

    return this.userService.findAll(filters, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Username or email already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a user (set isActive=false)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.delete(id);
  }

  @Post(':id/roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign roles to a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Roles assigned successfully' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  @ApiResponse({ status: 409, description: 'User already has the role' })
  async assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ) {
    return this.userService.assignRoles(id, dto.roleIds);
  }

  @Delete(':id/roles/:roleId')
  @ApiOperation({ summary: 'Remove a role from a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiParam({ name: 'roleId', description: 'Role UUID to remove' })
  @ApiResponse({ status: 200, description: 'Role removed successfully' })
  @ApiResponse({ status: 404, description: 'User or role assignment not found' })
  async removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.userService.removeRole(id, roleId);
  }
}
