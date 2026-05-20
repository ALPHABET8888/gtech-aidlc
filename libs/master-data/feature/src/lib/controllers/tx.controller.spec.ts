import { Test, TestingModule } from '@nestjs/testing';
import { TxController } from './tx.controller';
import { TxLogService } from '../services/tx-log.service';
import { VoidService } from '../services/void.service';
import { ApprovalService } from '../services/approval.service';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { TxStatus, TxType } from '@prisma/client';
import { CreateTxDto } from '../dto/create-tx.dto';
import { VoidTxDto } from '../dto/void-tx.dto';
import { AuthContext } from '@autoflow/shared-types';
import { Role } from '@autoflow/shared-types';
import { NotFoundException } from '@nestjs/common';
import { ImmutableTxException, InsufficientRoleException } from '@autoflow/shared-errors';

describe('TxController', () => {
  let controller: TxController;
  let txLogService: jest.Mocked<TxLogService>;
  let txLogRepository: jest.Mocked<TxLogRepository>;
  let voidService: jest.Mocked<VoidService>;
  let approvalService: jest.Mocked<ApprovalService>;

  const mockUser: AuthContext = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    username: 'testuser',
    displayName: 'Test User',
    roles: [Role.ADMIN],
    isActive: true,
  };

  const mockTx = {
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
    maBefore: null,
    maAfter: null,
    stockBefore: null,
    stockAfter: null,
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
    createdBy: mockUser.userId,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TxController],
      providers: [
        {
          provide: TxLogService,
          useValue: {
            createTx: jest.fn(),
            getTx: jest.fn(),
            assertMutable: jest.fn(),
          },
        },
        {
          provide: TxLogRepository,
          useValue: {
            findMany: jest.fn(),
          },
        },
        {
          provide: VoidService,
          useValue: {
            voidTransaction: jest.fn(),
          },
        },
        {
          provide: ApprovalService,
          useValue: {
            approveTx: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TxController>(TxController);
    txLogService = module.get(TxLogService);
    txLogRepository = module.get(TxLogRepository);
    voidService = module.get(VoidService);
    approvalService = module.get(ApprovalService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /tx (createTx)', () => {
    const dto: CreateTxDto = {
      txType: TxType.GR_RECEIVE,
      txDate: '2025-01-20T00:00:00Z',
      period: '2025-01',
      itemId: '550e8400-e29b-41d4-a716-446655440001',
      warehouseId: '550e8400-e29b-41d4-a716-446655440002',
      qty: 100,
      unitCost: 50,
      totalCost: 5000,
      vendorId: '550e8400-e29b-41d4-a716-446655440003',
    };

    it('should call txLogService.createTx with DTO and userId', async () => {
      txLogService.createTx.mockResolvedValue(mockTx);

      const result = await controller.createTx(dto, mockUser);

      expect(txLogService.createTx).toHaveBeenCalledWith(dto, mockUser.userId);
      expect(result).toEqual(mockTx);
    });

    it('should propagate service errors', async () => {
      txLogService.createTx.mockRejectedValue(new Error('Period locked'));

      await expect(controller.createTx(dto, mockUser)).rejects.toThrow(
        'Period locked',
      );
    });
  });

  describe('GET /tx (listTx)', () => {
    const mockPaginatedResult = {
      data: [mockTx],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    };

    it('should call repository.findMany with filters and pagination', async () => {
      txLogRepository.findMany.mockResolvedValue(mockPaginatedResult);

      const query = {
        txType: 'GR_RECEIVE',
        txStatus: TxStatus.POSTED,
        period: '2025-01',
        page: 1,
        pageSize: 20,
      };

      const result = await controller.listTx(query);

      expect(txLogRepository.findMany).toHaveBeenCalledWith(
        {
          txType: 'GR_RECEIVE',
          txStatus: TxStatus.POSTED,
          period: '2025-01',
          itemId: undefined,
          warehouseId: undefined,
        },
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should use default pagination when not provided', async () => {
      txLogRepository.findMany.mockResolvedValue(mockPaginatedResult);

      const result = await controller.listTx({});

      expect(txLogRepository.findMany).toHaveBeenCalledWith(
        {
          txType: undefined,
          txStatus: undefined,
          period: undefined,
          itemId: undefined,
          warehouseId: undefined,
        },
        { page: 1, pageSize: 20 },
      );
      expect(result).toEqual(mockPaginatedResult);
    });

    it('should pass itemId and warehouseId filters', async () => {
      txLogRepository.findMany.mockResolvedValue(mockPaginatedResult);

      const query = {
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        page: 2,
        pageSize: 10,
      };

      await controller.listTx(query);

      expect(txLogRepository.findMany).toHaveBeenCalledWith(
        {
          txType: undefined,
          txStatus: undefined,
          period: undefined,
          itemId: '550e8400-e29b-41d4-a716-446655440001',
          warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        },
        { page: 2, pageSize: 10 },
      );
    });
  });

  describe('GET /tx/:id (getTx)', () => {
    it('should call txLogService.getTx with the provided ID', async () => {
      txLogService.getTx.mockResolvedValue(mockTx);

      const result = await controller.getTx(mockTx.id);

      expect(txLogService.getTx).toHaveBeenCalledWith(mockTx.id);
      expect(result).toEqual(mockTx);
    });

    it('should return null when transaction not found', async () => {
      txLogService.getTx.mockResolvedValue(null);

      const result = await controller.getTx(
        '550e8400-e29b-41d4-a716-446655440099',
      );

      expect(result).toBeNull();
    });
  });

  describe('POST /tx/:id/approve (approveTx)', () => {
    const mockApprovedTx = {
      ...mockTx,
      txStatus: TxStatus.POSTED,
      approvedBy: mockUser.userId,
      approvedAt: new Date('2025-01-20T12:00:00Z'),
    };

    it('should call approvalService.approveTx with id and user', async () => {
      approvalService.approveTx.mockResolvedValue(mockApprovedTx);

      const result = await controller.approveTx(mockTx.id, mockUser);

      expect(approvalService.approveTx).toHaveBeenCalledWith(
        mockTx.id,
        mockUser,
      );
      expect(result).toEqual(mockApprovedTx);
    });

    it('should return the approved TX with POSTED status', async () => {
      approvalService.approveTx.mockResolvedValue(mockApprovedTx);

      const result = await controller.approveTx(mockTx.id, mockUser);

      expect(result.txStatus).toBe(TxStatus.POSTED);
      expect(result.approvedBy).toBe(mockUser.userId);
      expect(result.approvedAt).toBeDefined();
    });

    it('should propagate NotFoundException from service', async () => {
      approvalService.approveTx.mockRejectedValue(
        new NotFoundException('Transaction 550e8400-e29b-41d4-a716-446655440099 not found'),
      );

      await expect(
        controller.approveTx('550e8400-e29b-41d4-a716-446655440099', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate ImmutableTxException when TX is not DRAFT', async () => {
      approvalService.approveTx.mockRejectedValue(
        new ImmutableTxException(mockTx.id),
      );

      await expect(
        controller.approveTx(mockTx.id, mockUser),
      ).rejects.toThrow(ImmutableTxException);
    });

    it('should propagate InsufficientRoleException for unauthorized user', async () => {
      const cashierUser: AuthContext = {
        ...mockUser,
        roles: [Role.CASHIER],
      };

      approvalService.approveTx.mockRejectedValue(
        new InsufficientRoleException('MANAGER, CFO, ADMIN', 'CASHIER'),
      );

      await expect(
        controller.approveTx(mockTx.id, cashierUser),
      ).rejects.toThrow(InsufficientRoleException);
    });
  });

  describe('POST /tx/:id/void (voidTx)', () => {
    const voidDto: VoidTxDto = {
      reason: 'Incorrect quantity recorded — vendor confirmed different shipment',
    };

    const mockReverseTx = {
      ...mockTx,
      id: '550e8400-e29b-41d4-a716-446655440020',
      txType: TxType.VOID,
      txStatus: TxStatus.POSTED,
      qty: -100 as any,
      totalCost: -5000 as any,
      parentTxId: mockTx.id,
      reason: voidDto.reason,
    };

    it('should call voidService.voidTransaction with id, reason, and user', async () => {
      voidService.voidTransaction.mockResolvedValue(mockReverseTx);

      const result = await controller.voidTx(mockTx.id, voidDto, mockUser);

      expect(voidService.voidTransaction).toHaveBeenCalledWith(
        mockTx.id,
        voidDto.reason,
        mockUser,
      );
      expect(result).toEqual(mockReverseTx);
    });

    it('should return the reverse TX entry on success', async () => {
      voidService.voidTransaction.mockResolvedValue(mockReverseTx);

      const result = await controller.voidTx(mockTx.id, voidDto, mockUser);

      expect(result.txType).toBe(TxType.VOID);
      expect(result.parentTxId).toBe(mockTx.id);
      expect(result.reason).toBe(voidDto.reason);
    });

    it('should propagate NotFoundException from service', async () => {
      voidService.voidTransaction.mockRejectedValue(
        new Error('Transaction not found'),
      );

      await expect(
        controller.voidTx('550e8400-e29b-41d4-a716-446655440099', voidDto, mockUser),
      ).rejects.toThrow('Transaction not found');
    });

    it('should propagate insufficient role errors from service', async () => {
      const cashierUser: AuthContext = {
        ...mockUser,
        roles: [Role.CASHIER],
      };

      voidService.voidTransaction.mockRejectedValue(
        new Error('Insufficient role'),
      );

      await expect(
        controller.voidTx(mockTx.id, voidDto, cashierUser),
      ).rejects.toThrow('Insufficient role');
    });
  });
});
