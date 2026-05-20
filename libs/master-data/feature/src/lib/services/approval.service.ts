import { Injectable, NotFoundException } from '@nestjs/common';
import { TxLog, TxStatus } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { InsufficientRoleException, ImmutableTxException } from '@autoflow/shared-errors';
import { AuthContext, Role } from '@autoflow/shared-types';

/**
 * Default roles allowed to approve a transaction (Manager+).
 * Can be overridden per endpoint via @RequiresApproval() decorator.
 */
const DEFAULT_APPROVAL_ROLES: Role[] = [Role.MANAGER, Role.CFO, Role.ADMIN];

/**
 * ApprovalService — manages the DRAFT → POSTED approval flow.
 *
 * Responsibilities:
 * - Validate user has required approval role
 * - Transition TX status from DRAFT → POSTED
 * - Record approved_by and approved_at timestamp
 * - Throw InsufficientRoleException on unauthorized attempts
 * - Throw ImmutableTxException if TX is not in DRAFT status
 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txLogRepository: TxLogRepository,
  ) {}

  /**
   * Approve a DRAFT transaction — sets status to POSTED and records approval metadata.
   *
   * @param txId - The ID of the transaction to approve
   * @param user - Authenticated user context (must have required role)
   * @param requiredRoles - Roles allowed to approve (defaults to Manager+)
   * @returns The updated TxLog entry with status=POSTED, approved_by, approved_at
   * @throws NotFoundException if the TX does not exist
   * @throws ImmutableTxException if the TX is not in DRAFT status
   * @throws InsufficientRoleException if the user does not have a required role
   */
  async approveTx(
    txId: string,
    user: AuthContext,
    requiredRoles: Role[] = DEFAULT_APPROVAL_ROLES,
  ): Promise<TxLog> {
    // Step 1: Validate user has required role
    const hasRequiredRole = user.roles.some((role) =>
      requiredRoles.includes(role),
    );
    if (!hasRequiredRole) {
      throw new InsufficientRoleException(
        requiredRoles.join(', '),
        user.roles.join(', ') || 'NONE',
      );
    }

    // Step 2: Fetch the TX
    const tx = await this.txLogRepository.findById(txId);
    if (!tx) {
      throw new NotFoundException(`Transaction ${txId} not found`);
    }

    // Step 3: Validate TX is in DRAFT status
    if (tx.txStatus !== TxStatus.DRAFT) {
      throw new ImmutableTxException(txId);
    }

    // Step 4: Transition DRAFT → POSTED with approval metadata
    const approvedTx = await this.prisma.txLog.update({
      where: { id: txId },
      data: {
        txStatus: TxStatus.POSTED,
        approvedBy: user.userId,
        approvedAt: new Date(),
      },
    });

    return approvedTx;
  }
}
