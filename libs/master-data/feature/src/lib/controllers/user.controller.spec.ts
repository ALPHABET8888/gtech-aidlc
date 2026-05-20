import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

describe('UserController', () => {
  let controller: UserController;
  let service: jest.Mocked<UserService>;

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
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            assignRoles: jest.fn(),
            removeRole: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get(UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /users (create)', () => {
    const dto: CreateUserDto = {
      username: 'somchai',
      password: 'SecureP@ss123',
      fullName: 'สมชาย ใจดี',
      email: 'somchai@company.co.th',
    };

    it('should create and return the new user', async () => {
      service.create.mockResolvedValue(mockUserWithRoles);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockUserWithRoles);
    });

    it('should propagate ConflictException from service', async () => {
      service.create.mockRejectedValue(
        new ConflictException("User with username 'somchai' already exists"),
      );

      await expect(controller.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('GET /users (findAll)', () => {
    const mockPaginatedResult = {
      data: [mockUserWithRoles],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };

    it('should return paginated users with default pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith(
        { username: undefined, fullName: undefined, isActive: undefined },
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass filters and custom pagination', async () => {
      service.findAll.mockResolvedValue(mockPaginatedResult);

      const query = {
        username: 'som',
        fullName: 'สมชาย',
        isActive: true,
        page: 2,
        pageSize: 10,
      };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(
        { username: 'som', fullName: 'สมชาย', isActive: true },
        { page: 2, pageSize: 10 },
      );
    });
  });

  describe('GET /users/:id (findById)', () => {
    it('should return user by ID', async () => {
      service.findById.mockResolvedValue(mockUserWithRoles);

      const result = await controller.findById(mockUserWithRoles.id);

      expect(service.findById).toHaveBeenCalledWith(mockUserWithRoles.id);
      expect(result).toEqual(mockUserWithRoles);
    });

    it('should propagate NotFoundException', async () => {
      service.findById.mockRejectedValue(
        new NotFoundException("User with ID '...' not found"),
      );

      await expect(
        controller.findById('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PATCH /users/:id (update)', () => {
    const dto: UpdateUserDto = { fullName: 'Updated Name' };

    it('should update and return the user', async () => {
      const updatedUser = { ...mockUserWithRoles, displayName: 'Updated Name' };
      service.update.mockResolvedValue(updatedUser);

      const result = await controller.update(mockUserWithRoles.id, dto);

      expect(service.update).toHaveBeenCalledWith(mockUserWithRoles.id, dto);
      expect(result.displayName).toBe('Updated Name');
    });

    it('should propagate NotFoundException', async () => {
      service.update.mockRejectedValue(new NotFoundException());

      await expect(
        controller.update('550e8400-e29b-41d4-a716-446655440099', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ConflictException for duplicate username', async () => {
      service.update.mockRejectedValue(new ConflictException());

      await expect(
        controller.update(mockUserWithRoles.id, { username: 'existing' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /users/:id (delete)', () => {
    it('should soft-delete and return the deactivated user', async () => {
      const deletedUser = { ...mockUserWithRoles, isActive: false };
      service.delete.mockResolvedValue(deletedUser);

      const result = await controller.delete(mockUserWithRoles.id);

      expect(service.delete).toHaveBeenCalledWith(mockUserWithRoles.id);
      expect(result.isActive).toBe(false);
    });

    it('should propagate NotFoundException', async () => {
      service.delete.mockRejectedValue(new NotFoundException());

      await expect(
        controller.delete('550e8400-e29b-41d4-a716-446655440099'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /users/:id/roles (assignRoles)', () => {
    it('should assign roles and return updated user', async () => {
      const updatedUser = {
        ...mockUserWithRoles,
        userRoles: [
          ...mockUserWithRoles.userRoles,
          { id: 'ur-new', userId: mockUserWithRoles.id, roleId: 'role-002', assignedAt: new Date(), role: { id: 'role-002', name: 'MANAGER', description: null } },
        ],
      };
      service.assignRoles.mockResolvedValue(updatedUser);

      const result = await controller.assignRoles(mockUserWithRoles.id, { roleIds: ['role-002'] });

      expect(service.assignRoles).toHaveBeenCalledWith(mockUserWithRoles.id, ['role-002']);
      expect(result.userRoles.length).toBe(2);
    });

    it('should propagate NotFoundException if user not found', async () => {
      service.assignRoles.mockRejectedValue(new NotFoundException());

      await expect(
        controller.assignRoles('non-existent-id', { roleIds: ['role-001'] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ConflictException if role already assigned', async () => {
      service.assignRoles.mockRejectedValue(new ConflictException());

      await expect(
        controller.assignRoles(mockUserWithRoles.id, { roleIds: ['role-001'] }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('DELETE /users/:id/roles/:roleId (removeRole)', () => {
    it('should remove role and return updated user', async () => {
      const updatedUser = { ...mockUserWithRoles, userRoles: [] };
      service.removeRole.mockResolvedValue(updatedUser);

      const result = await controller.removeRole(mockUserWithRoles.id, 'role-001');

      expect(service.removeRole).toHaveBeenCalledWith(mockUserWithRoles.id, 'role-001');
      expect(result.userRoles.length).toBe(0);
    });

    it('should propagate NotFoundException if assignment not found', async () => {
      service.removeRole.mockRejectedValue(new NotFoundException());

      await expect(
        controller.removeRole(mockUserWithRoles.id, 'non-assigned-role'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
