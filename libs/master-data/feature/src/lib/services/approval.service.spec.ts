import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TxStatus, TxType } from '@prisma/client';
import { PrismaService } from '@autoflow/shared-prisma';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { InsufficientRoleException, ImmutableTxException } from '@autoflow/shared-errors';
import { AuthContext, Role } from '@autoflow/shared-types';
import { ApprovalService } from './approval.service';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let txLogRepository: jest.Mocked<TxLogRepository>;
  let prismaService: { txLog: { update: jest.Mock } };

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

  const mockCfoUser: AuthContext = {
    userId: 'user-cfo-001',
    username: 'cfo1',
    displayName: 'CFO One',
    roles: [Role.CFO],
    isActive: true,
  };

  const mockDraftTx = {
    id: 'tx-001',
    txType: TxType.GR_RECEIVE,
    txStatus: TxStatus.DRAFT,
    txDate: new Date('2025-01-20'),
    period: '2025-01',
    itemId: 'item-001',
    warehouseId: 'wh-001',
    qty: 100,
    unitCost: 50,
    totalCost: 5000,
    maBefore: null,
    maAfter: null,
    stockBefore: null,
    stockAfter: null,
    vendorId: null,
    customerId: null,
    refJoId: null,
    refDoId: null,
    refInvoiceId: null,
    refGrId: null,
    refCnId: null,
    parentTxId: null,
    taxInvoiceNo: null,
    baseAmount: null,
    vatAmount: null,
    vatType: null,
    arAmount: null,
    apAmount: null,
    apArStatus: null,
    cogsUnit: null,
    reason: null,
    approvedBy: null,
    approvedAt: null,
    createdBy: 'user-store-001',
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  const mockPostedTx = {
    ...mockDraftTx,
    id: 'tx-002',
    txStatus: TxStatus.POSTED,
  };

  beforeEach(async () => {
    prismaService = {
      txLog: {
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: TxLogRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApprovalService>(ApprovalService);
    txLogRepository = module.get(TxLogRepository);
  });

  describe('approveTx', () => {
    it('should approve a DRAFT transaction when user has sufficient role (Manager)', async () => {
      txLogRepository.findById.mockResolvedValue(mockDraftTx as any);
      const approvedTx = {
        ...mockDraftTx,
        txStatus: TxStatus.POSTED,
        approvedBy: mockManagerUser.userId,
        approvedAt: new Date(),
      };
      prismaService.txLog.update.mockResolvedValue(approvedTx);

      const result = await service.approveTx(mockDraftTx.id, mockManagerUser);

      expect(result.txStatus).toBe(TxStatus.POSTED);
      expect(result.approvedBy).toBe(mockManagerUser.userId);
      expect(result.approvedAt).toBeDefined();
      expect(prismaService.txLog.update).toHaveBeenCalledWith({
        where: { id: mockDraftTx.id },
        data: {
          txStatus: TxStatus.POSTED,
          approvedBy: mockManagerUser.userId,
          approvedAt: expect.any(Date),
        },
      });
    });

    it('should approve a DRAFT transaction when user has CFO role', async () => {
      txLogRepository.findById.mockResolvedValue(mockDraftTx as any);
      const approvedTx = {
        ...mockDraftTx,
        txStatus: TxStatus.POSTED,
        approvedBy: mockCfoUser.userId,
        approvedAt: new Date(),
      };
      prismaService.txLog.update.mockResolvedValue(approvedTx);

      const result = await service.approveTx(mockDraftTx.id, mockCfoUser);

      expect(result.txStatus).toBe(TxStatus.POSTED);
      expect(result.approvedBy).toBe(mockCfoUser.userId);
    });

    it('should throw InsufficientRoleException when user role is insufficient', async () => {
      await expect(
        service.approveTx(mockDraftTx.id, mockCashierUser),
      ).rejects.toThrow(InsufficientRoleException);

      // Should not even attempt to fetch TX from repo
      expect(txLogRepository.findById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when TX does not exist', async () => {
      txLogRepository.findById.mockResolvedValue(null);

      await expect(
        service.approveTx('non-existent-id', mockManagerUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ImmutableTxException when TX is not in DRAFT status', async () => {
      txLogRepository.findById.mockResolvedValue(mockPostedTx as any);

      await expect(
        service.approveTx(mockPostedTx.id, mockManagerUser),
      ).rejects.toThrow(ImmutableTxException);
    });

    it('should throw ImmutableTxException when TX is VOIDED', async () => {
      const voidedTx = { ...mockDraftTx, id: 'tx-003', txStatus: TxStatus.VOIDED };
      txLogRepository.findById.mockResolvedValue(voidedTx as any);

      await expect(
        service.approveTx(voidedTx.id, mockManagerUser),
      ).rejects.toThrow(ImmutableTxException);
    });

    it('should use custom required roles when provided', async () => {
      txLogRepository.findById.mockResolvedValue(mockDraftTx as any);
      const approvedTx = {
        ...mockDraftTx,
        txStatus: TxStatus.POSTED,
        approvedBy: mockCfoUser.userId,
        approvedAt: new Date(),
      };
      prismaService.txLog.update.mockResolvedValue(approvedTx);

      // CFO-only approval
      const result = await service.approveTx(
        mockDraftTx.id,
        mockCfoUser,
        [Role.CFO],
      );

      expect(result.txStatus).toBe(TxStatus.POSTED);
    });

    it('should throw InsufficientRoleException with custom roles when user lacks them', async () => {
      // Manager trying to approve a CFO-only TX
      await expect(
        service.approveTx(mockDraftTx.id, mockManagerUser, [Role.CFO]),
      ).rejects.toThrow(InsufficientRoleException);
    });
  });
});
