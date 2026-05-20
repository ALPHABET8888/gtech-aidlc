import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Role, AuthContext } from '@autoflow/shared-types';
import { InsufficientRoleException } from '@autoflow/shared-errors';
import { ApprovalGuard } from './approval.guard';
import { REQUIRES_APPROVAL_KEY } from '../decorators/requires-approval.decorator';

describe('ApprovalGuard', () => {
  let guard: ApprovalGuard;
  let reflector: Reflector;

  const mockManagerUser: AuthContext = {
    userId: 'user-manager-001',
    username: 'manager1',
    displayName: 'Manager One',
    roles: [Role.MANAGER],
    isActive: true,
  };

  const mockCashierUser: AuthContext = {
    userId: 'user-cashier-001',
    username: 'cashier1',
    displayName: 'Cashier One',
    roles: [Role.CASHIER],
    isActive: true,
  };

  const mockAdminUser: AuthContext = {
    userId: 'user-admin-001',
    username: 'admin1',
    displayName: 'Admin One',
    roles: [Role.ADMIN],
    isActive: true,
  };

  const mockCfoUser: AuthContext = {
    userId: 'user-cfo-001',
    username: 'cfo1',
    displayName: 'CFO One',
    roles: [Role.CFO],
    isActive: true,
  };

  const mockMultiRoleUser: AuthContext = {
    userId: 'user-multi-001',
    username: 'multi1',
    displayName: 'Multi Role',
    roles: [Role.SUPERVISOR, Role.MANAGER],
    isActive: true,
  };

  function createMockExecutionContext(user: AuthContext | null): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: jest.fn(),
        getNext: jest.fn(),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprovalGuard, Reflector],
    }).compile();

    guard = module.get<ApprovalGuard>(ApprovalGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when no @RequiresApproval() decorator is present', () => {
    it('should allow access (return true)', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockExecutionContext(mockCashierUser);

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      const context = createMockExecutionContext(mockCashierUser);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when @RequiresApproval(Role.MANAGER) is applied', () => {
    beforeEach(() => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.MANAGER, Role.CFO, Role.ADMIN]);
    });

    it('should allow access for Manager', () => {
      const context = createMockExecutionContext(mockManagerUser);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access for CFO', () => {
      const context = createMockExecutionContext(mockCfoUser);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access for Admin', () => {
      const context = createMockExecutionContext(mockAdminUser);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw InsufficientRoleException for Cashier', () => {
      const context = createMockExecutionContext(mockCashierUser);

      expect(() => guard.canActivate(context)).toThrow(
        InsufficientRoleException,
      );
    });

    it('should allow access for user with multiple roles including Manager', () => {
      const context = createMockExecutionContext(mockMultiRoleUser);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when @RequiresApproval(Role.CFO) is applied (CFO-only)', () => {
    beforeEach(() => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.CFO]);
    });

    it('should allow access for CFO', () => {
      const context = createMockExecutionContext(mockCfoUser);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw InsufficientRoleException for Manager', () => {
      const context = createMockExecutionContext(mockManagerUser);

      expect(() => guard.canActivate(context)).toThrow(
        InsufficientRoleException,
      );
    });
  });

  describe('when user is not authenticated', () => {
    beforeEach(() => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([Role.MANAGER]);
    });

    it('should throw InsufficientRoleException when user is null', () => {
      const context = createMockExecutionContext(null);

      expect(() => guard.canActivate(context)).toThrow(
        InsufficientRoleException,
      );
    });

    it('should throw InsufficientRoleException when user has no roles', () => {
      const noRolesUser = {
        ...mockCashierUser,
        roles: undefined as unknown as Role[],
      };
      const context = createMockExecutionContext(noRolesUser);

      expect(() => guard.canActivate(context)).toThrow(
        InsufficientRoleException,
      );
    });
  });
});
