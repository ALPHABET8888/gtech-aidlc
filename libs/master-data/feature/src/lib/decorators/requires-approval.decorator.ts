import { SetMetadata } from '@nestjs/common';
import { Role } from '@autoflow/shared-types';

/** Metadata key used by ApprovalGuard to read the required approval role. */
export const REQUIRES_APPROVAL_KEY = 'requires_approval';

/**
 * Decorator that sets the minimum role required to approve a transaction.
 * Used in conjunction with ApprovalGuard to enforce approval authority.
 *
 * @example
 * ```ts
 * @RequiresApproval(Role.MANAGER)
 * @UseGuards(JwtAuthGuard, ApprovalGuard)
 * @Post(':id/approve')
 * approve(@Param('id') id: string, @CurrentUser() user: AuthContext) { ... }
 * ```
 */
export const RequiresApproval = (...roles: Role[]) =>
  SetMetadata(REQUIRES_APPROVAL_KEY, roles);
