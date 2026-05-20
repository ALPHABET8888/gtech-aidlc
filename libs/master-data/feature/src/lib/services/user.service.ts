import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRepository, UserWithRoles, PaginatedResult } from '@autoflow/master-data-data-access';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

export interface UserFilters {
  username?: string;
  fullName?: string;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

const BCRYPT_ROUNDS = 10;

/**
 * Service handling User CRUD and Role assignment operations.
 */
@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Create or update a User (upsert by username).
   * If a user with the same username exists, updates their details.
   * If not, creates a new user with hashed password.
   */
  async create(dto: CreateUserDto): Promise<UserWithRoles> {
    const existingByUsername = await this.userRepository.findByUsername(dto.username);

    if (existingByUsername) {
      // Upsert: update existing user
      const updateData: Record<string, unknown> = {};
      if (dto.fullName !== undefined) updateData['displayName'] = dto.fullName;
      if (dto.email !== undefined) updateData['email'] = dto.email;
      if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;
      if (dto.password) {
        updateData['passwordHash'] = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      }

      // Check email uniqueness if being changed to a different user's email
      if (dto.email && dto.email !== existingByUsername.email) {
        const existingByEmail = await this.userRepository.findByEmail(dto.email);
        if (existingByEmail && existingByEmail.id !== existingByUsername.id) {
          throw new ConflictException(`User with email '${dto.email}' already exists`);
        }
      }

      return this.userRepository.update(existingByUsername.id, updateData);
    }

    // Check email uniqueness for new user
    if (dto.email) {
      const existingByEmail = await this.userRepository.findByEmail(dto.email);
      if (existingByEmail) {
        throw new ConflictException(`User with email '${dto.email}' already exists`);
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.userRepository.create({
      username: dto.username,
      passwordHash,
      displayName: dto.fullName,
      email: dto.email || null,
      isActive: dto.isActive ?? true,
    });
  }

  /**
   * List users with optional filtering and pagination.
   */
  async findAll(
    filters: UserFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<UserWithRoles>> {
    return this.userRepository.findMany(filters, pagination);
  }

  /**
   * Get a single user by ID.
   * @throws NotFoundException if user is not found.
   */
  async findById(id: string): Promise<UserWithRoles> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }
    return user;
  }

  /**
   * Update an existing user.
   * @throws NotFoundException if user is not found.
   * @throws ConflictException if updating username/email to one that already exists.
   */
  async update(id: string, dto: UpdateUserDto): Promise<UserWithRoles> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    // Check username uniqueness if being changed
    if (dto.username && dto.username !== user.username) {
      const existingWithUsername = await this.userRepository.findByUsername(dto.username);
      if (existingWithUsername) {
        throw new ConflictException(`User with username '${dto.username}' already exists`);
      }
    }

    // Check email uniqueness if being changed
    if (dto.email && dto.email !== user.email) {
      const existingWithEmail = await this.userRepository.findByEmail(dto.email);
      if (existingWithEmail) {
        throw new ConflictException(`User with email '${dto.email}' already exists`);
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (dto.username !== undefined) updateData['username'] = dto.username;
    if (dto.fullName !== undefined) updateData['displayName'] = dto.fullName;
    if (dto.email !== undefined) updateData['email'] = dto.email;
    if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;

    // Hash new password if provided
    if (dto.password) {
      updateData['passwordHash'] = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    return this.userRepository.update(id, updateData);
  }

  /**
   * Soft-delete a user by setting isActive to false.
   * @throws NotFoundException if user is not found.
   */
  async delete(id: string): Promise<UserWithRoles> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return this.userRepository.softDelete(id);
  }

  /**
   * Assign roles to a user.
   * @throws NotFoundException if user or role is not found.
   * @throws ConflictException if user already has the role.
   */
  async assignRoles(userId: string, roleIds: string[]): Promise<UserWithRoles> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found`);
    }

    for (const roleId of roleIds) {
      const role = await this.userRepository.findRoleById(roleId);
      if (!role) {
        throw new NotFoundException(`Role with ID '${roleId}' not found`);
      }

      const existingAssignment = await this.userRepository.findUserRole(userId, roleId);
      if (existingAssignment) {
        throw new ConflictException(`User already has role '${role.name}'`);
      }

      await this.userRepository.assignRole(userId, roleId);
    }

    // Return the updated user with all roles
    return this.userRepository.findById(userId) as Promise<UserWithRoles>;
  }

  /**
   * Remove a role from a user.
   * @throws NotFoundException if user or role assignment is not found.
   */
  async removeRole(userId: string, roleId: string): Promise<UserWithRoles> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID '${userId}' not found`);
    }

    const existingAssignment = await this.userRepository.findUserRole(userId, roleId);
    if (!existingAssignment) {
      throw new NotFoundException(`User does not have the specified role`);
    }

    await this.userRepository.removeRole(userId, roleId);

    // Return the updated user with remaining roles
    return this.userRepository.findById(userId) as Promise<UserWithRoles>;
  }
}
