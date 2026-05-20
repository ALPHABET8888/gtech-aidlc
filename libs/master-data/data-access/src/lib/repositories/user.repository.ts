import { Injectable } from '@nestjs/common';
import { User, UserRole, Prisma } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';

export interface UserFilters {
  username?: string;
  fullName?: string;
  isActive?: boolean;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type UserWithRoles = User & {
  userRoles: (UserRole & { role: { id: string; name: string; description: string | null } })[];
};

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new User.
   */
  async create(data: Prisma.UserCreateInput): Promise<UserWithRoles> {
    return this.prisma.user.create({
      data,
      include: {
        userRoles: { include: { role: true } },
      },
    }) as unknown as UserWithRoles;
  }

  /**
   * Find a User by ID (with roles).
   */
  async findById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { include: { role: true } },
      },
    }) as unknown as UserWithRoles | null;
  }

  /**
   * Find a User by username.
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  /**
   * Find a User by email.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Find many Users with filters and pagination.
   */
  async findMany(
    filters: UserFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<UserWithRoles>> {
    const where = this.buildWhereClause(filters);
    const skip = (pagination.page - 1) * pagination.pageSize;
    const take = pagination.pageSize;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          userRoles: { include: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data as unknown as UserWithRoles[],
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  /**
   * Update a User by ID.
   */
  async update(id: string, data: Prisma.UserUpdateInput): Promise<UserWithRoles> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: {
        userRoles: { include: { role: true } },
      },
    }) as unknown as UserWithRoles;
  }

  /**
   * Soft-delete a User by setting isActive to false.
   */
  async softDelete(id: string): Promise<UserWithRoles> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      include: {
        userRoles: { include: { role: true } },
      },
    }) as unknown as UserWithRoles;
  }

  /**
   * Assign a role to a user.
   */
  async assignRole(userId: string, roleId: string): Promise<UserRole> {
    return this.prisma.userRole.create({
      data: { userId, roleId },
    });
  }

  /**
   * Remove a role from a user.
   */
  async removeRole(userId: string, roleId: string): Promise<UserRole> {
    return this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });
  }

  /**
   * Find a specific user-role assignment.
   */
  async findUserRole(userId: string, roleId: string): Promise<UserRole | null> {
    return this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
  }

  /**
   * Find a role by ID.
   */
  async findRoleById(roleId: string): Promise<{ id: string; name: string; description: string | null } | null> {
    return this.prisma.roleRecord.findUnique({ where: { id: roleId } });
  }

  private buildWhereClause(filters: UserFilters): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    if (filters.username) {
      where.username = { contains: filters.username, mode: 'insensitive' };
    }
    if (filters.fullName) {
      where.displayName = { contains: filters.fullName, mode: 'insensitive' };
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return where;
  }
}
