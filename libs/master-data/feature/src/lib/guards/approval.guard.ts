import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, AuthContext } from '@autoflow/shared-types';
import { InsufficientRoleException } from '@autoflow/shared-errors';
import { REQUIRES_APPROVAL_KEY } from '../decorators/requires-approval.decorator';

/**
 * Guard that enforces approval authority based on the @RequiresApproval() decorator.
 *
 * Reads the required approval roles from route metadata and checks whether
 * the authenticated user has at least one of them. Throws InsufficientRoleException
 * if the user's roles do not satisfy the requirement.
 *
 * If no @RequiresApproval() decorator is present, access is granted.
 */
@Injectable()
export class ApprovalGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      REQUIRES_APPROVAL_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No approval roles specified — allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthContext = request.user;

    if (!user || !user.roles) {
      throw new InsufficientRoleException(
        requiredRoles.join(', '),
        'NONE',
      );
    }

    const hasRequiredRole = requiredRoles.some((role) =>
      user.roles.includes(role),
    );

    if (!hasRequiredRole) {
      throw new InsufficientRoleException(
        requiredRoles.join(', '),
        user.roles.join(', ') || 'NONE',
      );
    }

    return true;
  }
}
