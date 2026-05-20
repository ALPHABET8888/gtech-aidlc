import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { UserRepository } from '@autoflow/master-data-data-access';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('UserService', () => {
  let service: UserService;
  let repository: jest.Mocked<UserRepository>;

  const mockUserWithRoles = {
    id: '550e8400-e29b-41d4-a716-446655440030',
    username: 'somchai',
    email: 'somchai@company.co.th',
    passwordHash: '$2b$10$hashedpassword',
    displayName: 'สมชาย ใจดี',
    roles: [],
    isActive: true,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
    userRoles: [
      {
        id: 'ur-001',
        userId: '550e8400-e29b-41d4-a716-446655440030',
        roleId: 'role-001',
        assignedAt: new Date('2025-01-20T10:00:00Z'),
        role: { id: 'role-001', name: 'ADMIN', description: 'Administrator' },
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findByUsername: jest.fn(),
            findByEmail: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
            assignRole: jest.fn(),
            removeRole: jest.fn(),
            findUserRole: jest.fn(),
            findRoleById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(UserRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto: CreateUserDto = {
      username: 'somchai',
      password: 'SecureP@ss123',
      fullName: 'สมชาย ใจดี',
      email: 'somchai@company.co.th',
    };

    it('should create a new user with hashed password', async () => {
      repository.findByUsername.mockResolvedValue(null);
      repository.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      repository.create.mockResolvedValue(mockUserWithRoles);

      const result = await service.create(dto);

      expect(repository.findByUsername).toHaveBeenCalledWith('somchai');
      expect(repository.findByEmail).toHaveBeenCalledWith('somchai@company.co.th');
      expect(bcrypt.hash).toHaveBeenCalledWith('SecureP@ss123', 10);
      expect(repository.create).toHaveBeenCalledWith({
        username: 'somchai',
        passwordHash: '$2b$10$hashedpassword',
        displayName: 'สมชาย ใจดี',
        email: 'somchai@company.co.th',
        isActive: true,
      });
      expect(result).toEqual(mockUserWithRoles);
    });

    it('should update existing user if username already exists (upsert)', async () => {
      repository.findByUsername.mockResolvedValue(mockUserWithRoles as any);
      repository.update.mockResolvedValue(mockUserWithRoles);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhashedpassword');

      const result = await service.create(dto);

      expect(repository.update).toHaveBeenCalledWith(
        mockUserWithRoles.id,
        expect.objectContaining({ displayName: 'สมชาย ใจดี' }),
      );
      expect(repository.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockUserWithRoles);
    });

    it('should throw ConflictException if email already exists', async () => {
      repository.findByUsername.mockResolvedValue(null);
      repository.findByEmail.mockResolvedValue(mockUserWithRoles as any);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should default isActive to true when not provided', async () => {
      repository.findByUsername.mockResolvedValue(null);
      repository.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      repository.create.mockResolvedValue(mockUserWithRoles);

      await service.create({ username: 'newuser', password: 'pass123', fullName: 'New User' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should not check email uniqueness if email is not provided', async () => {
      repository.findByUsername.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashedpassword');
      repository.create.mockResolvedValue(mockUserWithRoles);

      await service.create({ username: 'newuser', password: 'pass123', fullName: 'New User' });

      expect(repository.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    const mockPaginatedResult = {
      data: [mockUserWithRoles],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated users with default pagination', async () => {
      repository.findMany.mockResolvedValue(mockPaginatedResult);

      const result = await service.findAll();

      expect(repository.findMany).toHaveBeenCalledWith(
        {},
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass filters and pagination to repository', async () => {
      repository.findMany.mockResolvedValue(mockPaginatedResult);

      const filters = { username: 'som', fullName: 'สมชาย', isActive: true };
      const pagination = { page: 2, pageSize: 10 };

      await service.findAll(filters, pagination);

      expect(repository.findMany).toHaveBeenCalledWith(filters, pagination);
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      repository.findById.mockResolvedValue(mockUserWithRoles);

      const result = await service.findById(mockUserWithRoles.id);

      expect(repository.findById).toHaveBeenCalledWith(mockUserWithRoles.id);
      expect(result).toEqual(mockUserWithRoles);
    });

    it('should throw NotFoundException when user not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const dto: UpdateUserDto = {
      fullName: 'สมชาย ใจดี (อัปเดต)',
    };

    it('should update an existing user', async () => {
      const updatedUser = { ...mockUserWithRoles, displayName: 'สมชาย ใจดี (อัปเดต)' };
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.update.mockResolvedValue(updatedUser);

      const result = await service.update(mockUserWithRoles.id, dto);

      expect(repository.update).toHaveBeenCalledWith(mockUserWithRoles.id, {
        displayName: 'สมชาย ใจดี (อัปเดต)',
      });
      expect(result).toEqual(updatedUser);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('550e8400-e29b-41d4-a716-446655440099', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new username already exists', async () => {
      const anotherUser = { ...mockUserWithRoles, id: 'other-id', username: 'existing' };
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.findByUsername.mockResolvedValue(anotherUser as any);

      await expect(
        service.update(mockUserWithRoles.id, { username: 'existing' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating to the same username without conflict', async () => {
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.update.mockResolvedValue(mockUserWithRoles);

      await service.update(mockUserWithRoles.id, { username: 'somchai' });

      expect(repository.findByUsername).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });

    it('should hash password when password is provided', async () => {
      repository.findById.mockResolvedValue(mockUserWithRoles);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhashedpassword');
      repository.update.mockResolvedValue(mockUserWithRoles);

      await service.update(mockUserWithRoles.id, { password: 'NewPassword123' });

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123', 10);
      expect(repository.update).toHaveBeenCalledWith(mockUserWithRoles.id, {
        passwordHash: '$2b$10$newhashedpassword',
      });
    });

    it('should throw ConflictException if new email already exists', async () => {
      const anotherUser = { ...mockUserWithRoles, id: 'other-id', email: 'taken@email.com' };
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.findByEmail.mockResolvedValue(anotherUser as any);

      await expect(
        service.update(mockUserWithRoles.id, { email: 'taken@email.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should soft-delete a user', async () => {
      const deletedUser = { ...mockUserWithRoles, isActive: false };
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.softDelete.mockResolvedValue(deletedUser);

      const result = await service.delete(mockUserWithRoles.id);

      expect(repository.softDelete).toHaveBeenCalledWith(mockUserWithRoles.id);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.delete('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignRoles', () => {
    const roleId = 'role-001';

    it('should assign a role to a user', async () => {
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.findRoleById.mockResolvedValue({ id: roleId, name: 'MANAGER', description: null });
      repository.findUserRole.mockResolvedValue(null);
      repository.assignRole.mockResolvedValue({
        id: 'ur-new',
        userId: mockUserWithRoles.id,
        roleId,
        assignedAt: new Date(),
      });

      // After assignment, findById returns updated user
      const updatedUser = {
        ...mockUserWithRoles,
        userRoles: [
          ...mockUserWithRoles.userRoles,
          { id: 'ur-new', userId: mockUserWithRoles.id, roleId, assignedAt: new Date(), role: { id: roleId, name: 'MANAGER', description: null } },
        ],
      };
      repository.findById.mockResolvedValueOnce(mockUserWithRoles).mockResolvedValueOnce(updatedUser);

      const result = await service.assignRoles(mockUserWithRoles.id, [roleId]);

      expect(repository.findRoleById).toHaveBeenCalledWith(roleId);
      expect(repository.assignRole).toHaveBeenCalledWith(mockUserWithRoles.id, roleId);
      expect(result.userRoles.length).toBe(2);
    });

    it('should throw NotFoundException if user not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.assignRoles('non-existent-id', [roleId]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if role not found', async () => {
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.findRoleById.mockResolvedValue(null);

      await expect(
        service.assignRoles(mockUserWithRoles.id, ['non-existent-role']),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user already has the role', async () => {
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.findRoleById.mockResolvedValue({ id: roleId, name: 'ADMIN', description: null });
      repository.findUserRole.mockResolvedValue({
        id: 'ur-001',
        userId: mockUserWithRoles.id,
        roleId,
        assignedAt: new Date(),
      });

      await expect(
        service.assignRoles(mockUserWithRoles.id, [roleId]),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeRole', () => {
    const roleId = 'role-001';

    it('should remove a role from a user', async () => {
      const userAfterRemoval = { ...mockUserWithRoles, userRoles: [] };
      repository.findById.mockResolvedValueOnce(mockUserWithRoles).mockResolvedValueOnce(userAfterRemoval);
      repository.findUserRole.mockResolvedValue({
        id: 'ur-001',
        userId: mockUserWithRoles.id,
        roleId,
        assignedAt: new Date(),
      });
      repository.removeRole.mockResolvedValue({
        id: 'ur-001',
        userId: mockUserWithRoles.id,
        roleId,
        assignedAt: new Date(),
      });

      const result = await service.removeRole(mockUserWithRoles.id, roleId);

      expect(repository.removeRole).toHaveBeenCalledWith(mockUserWithRoles.id, roleId);
      expect(result.userRoles.length).toBe(0);
    });

    it('should throw NotFoundException if user not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.removeRole('non-existent-id', roleId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if role assignment not found', async () => {
      repository.findById.mockResolvedValue(mockUserWithRoles);
      repository.findUserRole.mockResolvedValue(null);

      await expect(
        service.removeRole(mockUserWithRoles.id, 'non-assigned-role'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
