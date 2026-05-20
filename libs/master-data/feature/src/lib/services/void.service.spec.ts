import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VoidService } from './void.service';
import { MaCalculationService } from './ma-calculation.service';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import { InsufficientRoleException } from '@autoflow/shared-errors';
import { TxStatus, TxType } from '@prisma/client';
import { AuthContext, Role } from '@autoflow/shared-types';

describe('VoidService', () => {
  let service: VoidService;
  let prismaService: jest.Mocked<PrismaService>;
  let txLogRepository: jest.Mocked<TxLogRepository>;
  let maCalculationService: jest.Mocked<MaCalculationService>;

  const mockManagerUser: AuthContext = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    username: 'manager01',
    displayName: 'Test Manager',
    roles: [Role.MANAGER],
    isActive: true,
  };

  const mockCashierUser: AuthContext = {
    userId: '550e8400-e29b-41d4-a716-446655440099',
    username: 'cashier01',
    displayName: 'Test Cashier',
    roles: [Role.CASHIER],
    isActive: true,
  };

  const mockPostedTx = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    txType: TxType.GR_RECEIVE,
    txStatus: TxStatus.POSTED,
    txDate: new Date('2025-01-20T00:00:00Z'),
    period: '2025-01',
    itemId: '550e8400-e29b-41d4-a716-446655440001',
    warehouseId: '550e8400-e29b-41d4-a716-446655440002',
    qty: 100 as any,
    unitCost: 50 as any,
    totalCost: 5000 as any,
    maBefore: 40 as any,
    maAfter: 46.67 as any,
    stockBefore: 50 as any,
    stockAfter: 150 as any,
    vendorId: '550e8400-e29b-41d4-a716-446655440003',
    customerId: null,
    refJoId: null,
    refDoId: null,
    refInvoiceId: null,
    refGrId: null,
    refCnId: null,
    parentTxId: null,
    taxInvoiceNo: 'INV-001',
    baseAmount: 5000 as any,
    vatAmount: 350 as any,
    vatType: 'INPUT' as any,
    arAmount: null,
    apAmount: null,
    apArStatus: null,
    cogsUnit: null,
    reason: null,
    approvedBy: null,
    approvedAt: null,
    createdBy: '550e8400-e29b-41d4-a716-446655440099',
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  const mockReverseTx = {
    ...mockPostedTx,
    id: '550e8400-e29b-41d4-a716-446655440020',
    txType: TxType.VOID,
    qty: -100 as any,
    totalCost: -5000 as any,
    parentTxId: mockPostedTx.id,
    reason: 'Incorrect quantity received',
    createdBy: mockManagerUser.userId,
    maBefore: 46.67 as any,
    maAfter: 40 as any,
    stockBefore: 150 as any,
    stockAfter: 50 as any,
  };

  const mockMaResult = {
    maBefore: 46.67,
    maAfter: 40,
    stockBefore: 150,
    stockAfter: 50,
  };

  beforeEach(async () => {
    const mockPrismaClient = {
      txLog: {
        create: jest.fn().mockResolvedValue(mockReverseTx),
        update: jest.fn().mockResolvedValue({
          ...mockPostedTx,
          txStatus: TxStatus.VOIDED,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoidService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((callback) => callback(mockPrismaClient)),
          },
        },
        {
          provide: TxLogRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue(mockPostedTx),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: MaCalculationService,
          useValue: {
            calculateNewMa: jest.fn().mockResolvedValue(mockMaResult),
          },
        },
      ],
    }).compile();

    service = module.get<VoidService>(VoidService);
    prismaService = module.get(PrismaService);
    txLogRepository = module.get(TxLogRepository);
    maCalculationService = module.get(MaCalculationService);
  });

  describe('voidTransaction — successful void', () => {
    it('should create a reverse TX and set original to VOIDED', async () => {
      const result = await service.voidTransaction(
        mockPostedTx.id,
        'Incorrect quantity received',
        mockManagerUser,
      );

      expect(result).toEqual(mockReverseTx);
      expect(result.txType).toBe(TxType.VOID);
      expect(result.parentTxId).toBe(mockPostedTx.id);
      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should negate qty and costs in the reverse TX', async () => {
      let capturedData: any;
      const mockPrismaClient = {
        txLog: {
          create: jest.fn((args: any) => {
            capturedData = args.data;
            return Promise.resolve(mockReverseTx);
          }),
          update: jest.fn().mockResolvedValue({
            ...mockPostedTx,
            txStatus: TxStatus.VOIDED,
          }),
        },
      };

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => callback(mockPrismaClient),
      );

      await service.voidTransaction(
        mockPostedTx.id,
        'Incorrect quantity received',
        mockManagerUser,
      );

      expect(capturedData.qty).toBe(-100);
      expect(capturedData.totalCost).toBe(-5000);
      expect(capturedData.baseAmount).toBe(-5000);
      expect(capturedData.vatAmount).toBe(-350);
    });

    it('should update original TX status to VOIDED', async () => {
      let updatedId: string | undefined;
      let updatedData: any;
      const mockPrismaClient = {
        txLog: {
          create: jest.fn().mockResolvedValue(mockReverseTx),
          update: jest.fn((args: any) => {
            updatedId = args.where.id;
            updatedData = args.data;
            return Promise.resolve({
              ...mockPostedTx,
              txStatus: TxStatus.VOIDED,
            });
          }),
        },
      };

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => callback(mockPrismaClient),
      );

      await service.voidTransaction(
        mockPostedTx.id,
        'Incorrect quantity received',
        mockManagerUser,
      );

      expect(updatedId).toBe(mockPostedTx.id);
      expect(updatedData.txStatus).toBe(TxStatus.VOIDED);
    });

    it('should trigger MA recalculation for stock-affecting TX with reversed direction', async () => {
      await service.voidTransaction(
        mockPostedTx.id,
        'Incorrect quantity received',
        mockManagerUser,
      );

      // Original was GR_RECEIVE (stock increase), so reverse is decrease (isIncrease = false)
      expect(maCalculationService.calculateNewMa).toHaveBeenCalledWith(
        mockPostedTx.itemId,
        mockPostedTx.warehouseId,
        100, // absolute qty
        5000, // absolute totalCost
        false, // reversed: original was increase, so void is decrease
        expect.anything(), // prismaClient
      );
    });

    it('should allow CFO to void transactions', async () => {
      const cfoUser: AuthContext = {
        ...mockManagerUser,
        roles: [Role.CFO],
      };

      const result = await service.voidTransaction(
        mockPostedTx.id,
        'CFO override',
        cfoUser,
      );

      expect(result).toEqual(mockReverseTx);
    });

    it('should allow ADMIN to void transactions', async () => {
      const adminUser: AuthContext = {
        ...mockManagerUser,
        roles: [Role.ADMIN],
      };

      const result = await service.voidTransaction(
        mockPostedTx.id,
        'Admin override',
        adminUser,
      );

      expect(result).toEqual(mockReverseTx);
    });
  });

  describe('voidTransaction — void already-voided TX', () => {
    it('should reject voiding a transaction that is already VOIDED', async () => {
      const voidedTx = { ...mockPostedTx, txStatus: TxStatus.VOIDED };
      txLogRepository.findById.mockResolvedValue(voidedTx);

      await expect(
        service.voidTransaction(
          mockPostedTx.id,
          'Try to void again',
          mockManagerUser,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should reject voiding a transaction that is in DRAFT status', async () => {
      const draftTx = { ...mockPostedTx, txStatus: TxStatus.DRAFT };
      txLogRepository.findById.mockResolvedValue(draftTx);

      await expect(
        service.voidTransaction(
          mockPostedTx.id,
          'Try to void draft',
          mockManagerUser,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should reject voiding a transaction that does not exist', async () => {
      txLogRepository.findById.mockResolvedValue(null);

      await expect(
        service.voidTransaction(
          'non-existent-id',
          'No such TX',
          mockManagerUser,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('voidTransaction — void without reason', () => {
    it('should reject voiding without a reason (empty string)', async () => {
      await expect(
        service.voidTransaction(mockPostedTx.id, '', mockManagerUser),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should reject voiding with whitespace-only reason', async () => {
      await expect(
        service.voidTransaction(mockPostedTx.id, '   ', mockManagerUser),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('voidTransaction — insufficient role', () => {
    it('should reject void request from CASHIER role', async () => {
      await expect(
        service.voidTransaction(
          mockPostedTx.id,
          'Trying to void',
          mockCashierUser,
        ),
      ).rejects.toThrow(InsufficientRoleException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should reject void request from STORE role', async () => {
      const storeUser: AuthContext = {
        ...mockCashierUser,
        roles: [Role.STORE],
      };

      await expect(
        service.voidTransaction(mockPostedTx.id, 'Trying to void', storeUser),
      ).rejects.toThrow(InsufficientRoleException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should reject void request from SUPERVISOR role', async () => {
      const supervisorUser: AuthContext = {
        ...mockCashierUser,
        roles: [Role.SUPERVISOR],
      };

      await expect(
        service.voidTransaction(
          mockPostedTx.id,
          'Trying to void',
          supervisorUser,
        ),
      ).rejects.toThrow(InsufficientRoleException);

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('voidTransaction — non-stock TX', () => {
    it('should not trigger MA recalculation for non-stock TX types', async () => {
      const nonStockTx = {
        ...mockPostedTx,
        txType: TxType.EXPENSE_RECORD,
        itemId: null,
        warehouseId: null,
        qty: null,
        totalCost: null,
      };
      txLogRepository.findById.mockResolvedValue(nonStockTx);

      await service.voidTransaction(
        nonStockTx.id,
        'Wrong expense entry',
        mockManagerUser,
      );

      expect(maCalculationService.calculateNewMa).not.toHaveBeenCalled();
    });
  });

  describe('voidTransaction — stock-decreasing original TX', () => {
    it('should reverse a SALE_INVOICE (decrease) with an increase movement', async () => {
      const saleTx = {
        ...mockPostedTx,
        txType: TxType.SALE_INVOICE,
        qty: 10 as any,
        totalCost: 500 as any,
      };
      txLogRepository.findById.mockResolvedValue(saleTx);

      await service.voidTransaction(
        saleTx.id,
        'Customer returned goods',
        mockManagerUser,
      );

      // SALE_INVOICE is stock-decreasing, so reverse is stock-increasing (isIncrease = true)
      expect(maCalculationService.calculateNewMa).toHaveBeenCalledWith(
        saleTx.itemId,
        saleTx.warehouseId,
        10, // absolute qty
        500, // absolute totalCost
        true, // reversed: original was decrease, so void is increase
        expect.anything(),
      );
    });
  });
});
