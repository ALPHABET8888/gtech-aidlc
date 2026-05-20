import { Test, TestingModule } from '@nestjs/testing';
import { TxLogService } from './tx-log.service';
import { PeriodService } from './period.service';
import { MaCalculationService } from './ma-calculation.service';
import { StockValidationService } from './stock-validation.service';
import { RefChainValidatorService } from './ref-chain-validator.service';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import {
  ImmutableTxException,
  PeriodLockedException,
  StockNegativeException,
  StockFrozenException,
  RefChainInvalidException,
} from '@autoflow/shared-errors';
import { TxStatus, TxType } from '@prisma/client';
import { CreateTxDto } from '../dto/create-tx.dto';

describe('TxLogService', () => {
  let service: TxLogService;
  let prismaService: jest.Mocked<PrismaService>;
  let txLogRepository: jest.Mocked<TxLogRepository>;
  let periodService: jest.Mocked<PeriodService>;
  let maCalculationService: jest.Mocked<MaCalculationService>;
  let stockValidationService: jest.Mocked<StockValidationService>;
  let refChainValidatorService: jest.Mocked<RefChainValidatorService>;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';

  const mockCreateTxDto: CreateTxDto = {
    txType: TxType.GR_RECEIVE,
    txDate: '2025-01-20T00:00:00Z',
    period: '2025-01',
    itemId: '550e8400-e29b-41d4-a716-446655440001',
    warehouseId: '550e8400-e29b-41d4-a716-446655440002',
    qty: 100,
    unitCost: 50,
    totalCost: 5000,
    vendorId: '550e8400-e29b-41d4-a716-446655440003',
    taxInvoiceNo: 'INV-001',
    baseAmount: 5000,
    vatAmount: 350,
    vatType: 'INPUT' as any,
  };

  const mockMaResult = {
    maBefore: 40,
    maAfter: 46.67,
    stockBefore: 50,
    stockAfter: 150,
  };

  const mockCreatedTx = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    txType: TxType.GR_RECEIVE,
    txStatus: TxStatus.DRAFT,
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
    createdBy: mockUserId,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaClient = {
      txLog: {
        create: jest.fn().mockResolvedValue(mockCreatedTx),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxLogService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((callback) => callback(mockPrismaClient)),
          },
        },
        {
          provide: TxLogRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findMany: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: PeriodService,
          useValue: {
            validatePeriodOpen: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MaCalculationService,
          useValue: {
            calculateNewMa: jest.fn().mockResolvedValue(mockMaResult),
            getCurrentMa: jest.fn().mockResolvedValue(40),
          },
        },
        {
          provide: StockValidationService,
          useValue: {
            validateStockAvailable: jest.fn().mockResolvedValue(undefined),
            getStockBalance: jest.fn().mockResolvedValue(50),
          },
        },
        {
          provide: RefChainValidatorService,
          useValue: {
            validateRefChain: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<TxLogService>(TxLogService);
    prismaService = module.get(PrismaService);
    txLogRepository = module.get(TxLogRepository);
    periodService = module.get(PeriodService);
    maCalculationService = module.get(MaCalculationService);
    stockValidationService = module.get(StockValidationService);
    refChainValidatorService = module.get(RefChainValidatorService);
  });

  describe('createTx', () => {
    it('should successfully create and POST a transaction', async () => {
      const result = await service.createTx(mockCreateTxDto, mockUserId);

      expect(result).toEqual(mockCreatedTx);
      expect(result.txStatus).toBe(TxStatus.DRAFT);
      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should call period validation before transaction creation', async () => {
      const callOrder: string[] = [];

      periodService.validatePeriodOpen.mockImplementation(async () => {
        callOrder.push('periodValidation');
      });

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          callOrder.push('transaction');
          const mockClient = {
            txLog: { create: jest.fn().mockResolvedValue(mockCreatedTx) },
          };
          return callback(mockClient);
        },
      );

      await service.createTx(mockCreateTxDto, mockUserId);

      expect(callOrder).toEqual(['periodValidation', 'transaction']);
    });

    it('should throw PeriodLockedException when period is closed', async () => {
      periodService.validatePeriodOpen.mockRejectedValue(
        new PeriodLockedException('2024-12'),
      );

      const dto: CreateTxDto = { ...mockCreateTxDto, period: '2024-12' };

      await expect(service.createTx(dto, mockUserId)).rejects.toThrow(
        PeriodLockedException,
      );

      // Transaction should not be started
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should set txStatus to DRAFT on successful creation', async () => {
      const result = await service.createTx(mockCreateTxDto, mockUserId);

      expect(result.txStatus).toBe(TxStatus.DRAFT);
    });

    it('should pass user ID as createdBy', async () => {
      let capturedData: any;
      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: {
              create: jest.fn((args: any) => {
                capturedData = args.data;
                return Promise.resolve(mockCreatedTx);
              }),
            },
          };
          return callback(mockClient);
        },
      );

      await service.createTx(mockCreateTxDto, mockUserId);

      expect(capturedData.createdBy).toBe(mockUserId);
    });

    it('should handle minimal DTO (non-stock TX)', async () => {
      const minimalDto: CreateTxDto = {
        txType: TxType.EXPENSE_RECORD,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        baseAmount: 1000,
      };

      const minimalResult = {
        ...mockCreatedTx,
        txType: TxType.EXPENSE_RECORD,
        itemId: null,
        warehouseId: null,
        qty: null,
        unitCost: null,
        totalCost: null,
        vendorId: null,
        taxInvoiceNo: null,
        vatAmount: null,
        vatType: null,
        baseAmount: 1000,
        maBefore: null,
        maAfter: null,
        stockBefore: null,
        stockAfter: null,
      };

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: { create: jest.fn().mockResolvedValue(minimalResult) },
          };
          return callback(mockClient);
        },
      );

      const result = await service.createTx(minimalDto, mockUserId);

      expect(result.txType).toBe(TxType.EXPENSE_RECORD);
      expect(result.itemId).toBeNull();
      // Non-stock TX should NOT call MA or stock validation
      expect(maCalculationService.calculateNewMa).not.toHaveBeenCalled();
      expect(stockValidationService.validateStockAvailable).not.toHaveBeenCalled();
    });
  });

  describe('createTx — MA + Stock integration', () => {
    it('should call MaCalculationService for stock-increasing TX (GR_RECEIVE)', async () => {
      await service.createTx(mockCreateTxDto, mockUserId);

      expect(maCalculationService.calculateNewMa).toHaveBeenCalledWith(
        mockCreateTxDto.itemId,
        mockCreateTxDto.warehouseId,
        mockCreateTxDto.qty,
        mockCreateTxDto.totalCost,
        true, // isIncrease = true for GR_RECEIVE
        expect.anything(), // prismaClient
      );
    });

    it('should call MaCalculationService for stock-decreasing TX (SALE_INVOICE)', async () => {
      const saleDto: CreateTxDto = {
        txType: TxType.SALE_INVOICE,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 10,
        unitCost: 50,
        totalCost: 500,
        customerId: '550e8400-e29b-41d4-a716-446655440005',
      };

      const saleResult = {
        ...mockCreatedTx,
        txType: TxType.SALE_INVOICE,
        qty: 10,
        unitCost: 50,
        totalCost: 500,
        maBefore: 50,
        maAfter: 50, // MA unchanged for decrease
        stockBefore: 100,
        stockAfter: 90,
      };

      const maDecreaseResult = {
        maBefore: 50,
        maAfter: 50, // unchanged
        stockBefore: 100,
        stockAfter: 90,
      };

      maCalculationService.calculateNewMa.mockResolvedValue(maDecreaseResult);

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: { create: jest.fn().mockResolvedValue(saleResult) },
          };
          return callback(mockClient);
        },
      );

      await service.createTx(saleDto, mockUserId);

      expect(maCalculationService.calculateNewMa).toHaveBeenCalledWith(
        saleDto.itemId,
        saleDto.warehouseId,
        saleDto.qty,
        saleDto.totalCost,
        false, // isIncrease = false for SALE_INVOICE
        expect.anything(),
      );
    });

    it('should validate stock availability for stock-decreasing TX', async () => {
      const saleDto: CreateTxDto = {
        txType: TxType.SALE_INVOICE,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 10,
        unitCost: 50,
        totalCost: 500,
      };

      await service.createTx(saleDto, mockUserId);

      expect(stockValidationService.validateStockAvailable).toHaveBeenCalledWith(
        saleDto.itemId,
        saleDto.warehouseId,
        saleDto.qty,
      );
    });

    it('should NOT validate stock availability for stock-increasing TX', async () => {
      await service.createTx(mockCreateTxDto, mockUserId);

      // GR_RECEIVE is stock-increasing — no stock validation needed
      expect(stockValidationService.validateStockAvailable).not.toHaveBeenCalled();
    });

    it('should throw StockNegativeException when stock is insufficient', async () => {
      const saleDto: CreateTxDto = {
        txType: TxType.SALE_INVOICE,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 200, // more than available
        unitCost: 50,
        totalCost: 10000,
      };

      stockValidationService.validateStockAvailable.mockRejectedValue(
        new StockNegativeException(saleDto.itemId!, 50, 200),
      );

      await expect(service.createTx(saleDto, mockUserId)).rejects.toThrow(
        StockNegativeException,
      );

      // Transaction should not be started after stock validation fails
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw StockFrozenException when stock is frozen', async () => {
      const saleDto: CreateTxDto = {
        txType: TxType.SALE_INVOICE,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 10,
        unitCost: 50,
        totalCost: 500,
      };

      stockValidationService.validateStockAvailable.mockRejectedValue(
        new StockFrozenException(saleDto.itemId!, saleDto.warehouseId!),
      );

      await expect(service.createTx(saleDto, mockUserId)).rejects.toThrow(
        StockFrozenException,
      );

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should record ma_before, ma_after, stock_before, stock_after in TX entry', async () => {
      let capturedData: any;
      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: {
              create: jest.fn((args: any) => {
                capturedData = args.data;
                return Promise.resolve(mockCreatedTx);
              }),
            },
          };
          return callback(mockClient);
        },
      );

      await service.createTx(mockCreateTxDto, mockUserId);

      expect(capturedData.maBefore).toBe(mockMaResult.maBefore);
      expect(capturedData.maAfter).toBe(mockMaResult.maAfter);
      expect(capturedData.stockBefore).toBe(mockMaResult.stockBefore);
      expect(capturedData.stockAfter).toBe(mockMaResult.stockAfter);
    });

    it('should set MA/stock fields to null for non-stock TX types', async () => {
      const expenseDto: CreateTxDto = {
        txType: TxType.EXPENSE_RECORD,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        baseAmount: 1000,
      };

      let capturedData: any;
      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: {
              create: jest.fn((args: any) => {
                capturedData = args.data;
                return Promise.resolve({
                  ...mockCreatedTx,
                  txType: TxType.EXPENSE_RECORD,
                  maBefore: null,
                  maAfter: null,
                  stockBefore: null,
                  stockAfter: null,
                });
              }),
            },
          };
          return callback(mockClient);
        },
      );

      await service.createTx(expenseDto, mockUserId);

      expect(capturedData.maBefore).toBeNull();
      expect(capturedData.maAfter).toBeNull();
      expect(capturedData.stockBefore).toBeNull();
      expect(capturedData.stockAfter).toBeNull();
    });

    it('should handle ADJ_COUNT_UP as stock-increasing TX', async () => {
      const adjUpDto: CreateTxDto = {
        txType: TxType.ADJ_COUNT_UP,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 5,
        unitCost: 40,
        totalCost: 200,
      };

      await service.createTx(adjUpDto, mockUserId);

      expect(maCalculationService.calculateNewMa).toHaveBeenCalledWith(
        adjUpDto.itemId,
        adjUpDto.warehouseId,
        adjUpDto.qty,
        adjUpDto.totalCost,
        true, // isIncrease
        expect.anything(),
      );
      expect(stockValidationService.validateStockAvailable).not.toHaveBeenCalled();
    });

    it('should handle ADJ_COUNT_DOWN as stock-decreasing TX', async () => {
      const adjDownDto: CreateTxDto = {
        txType: TxType.ADJ_COUNT_DOWN,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 5,
        unitCost: 40,
        totalCost: 200,
      };

      await service.createTx(adjDownDto, mockUserId);

      expect(maCalculationService.calculateNewMa).toHaveBeenCalledWith(
        adjDownDto.itemId,
        adjDownDto.warehouseId,
        adjDownDto.qty,
        adjDownDto.totalCost,
        false, // isIncrease = false for decrease
        expect.anything(),
      );
      expect(stockValidationService.validateStockAvailable).toHaveBeenCalledWith(
        adjDownDto.itemId,
        adjDownDto.warehouseId,
        adjDownDto.qty,
      );
    });

    it('should use qty * unitCost as totalValue when totalCost is not provided', async () => {
      const dtoWithoutTotalCost: CreateTxDto = {
        txType: TxType.GR_RECEIVE,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 100,
        unitCost: 50,
        vendorId: '550e8400-e29b-41d4-a716-446655440003',
      };

      await service.createTx(dtoWithoutTotalCost, mockUserId);

      expect(maCalculationService.calculateNewMa).toHaveBeenCalledWith(
        dtoWithoutTotalCost.itemId,
        dtoWithoutTotalCost.warehouseId,
        100,
        5000, // qty * unitCost = 100 * 50
        true,
        expect.anything(),
      );
    });

    it('should handle full pipeline: period → stock validation → refChain → MA → POST for sale', async () => {
      const callOrder: string[] = [];

      periodService.validatePeriodOpen.mockImplementation(async () => {
        callOrder.push('periodCheck');
      });

      stockValidationService.validateStockAvailable.mockImplementation(async () => {
        callOrder.push('stockValidation');
      });

      refChainValidatorService.validateRefChain.mockImplementation(async () => {
        callOrder.push('refChainValidation');
      });

      maCalculationService.calculateNewMa.mockImplementation(async () => {
        callOrder.push('maCalculation');
        return { maBefore: 50, maAfter: 50, stockBefore: 100, stockAfter: 90 };
      });

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: {
              create: jest.fn(async () => {
                callOrder.push('txCreate');
                return mockCreatedTx;
              }),
            },
          };
          return callback(mockClient);
        },
      );

      const saleDto: CreateTxDto = {
        txType: TxType.SALE_INVOICE,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 10,
        unitCost: 50,
        totalCost: 500,
      };

      await service.createTx(saleDto, mockUserId);

      // Period check, stock validation, and ref chain validation happen before the transaction
      // MA calculation and TX creation happen inside the transaction
      expect(callOrder).toEqual([
        'periodCheck',
        'stockValidation',
        'refChainValidation',
        'maCalculation',
        'txCreate',
      ]);
    });
  });

  describe('getTx', () => {
    it('should return a TX by ID', async () => {
      txLogRepository.findById.mockResolvedValue(mockCreatedTx);

      const result = await service.getTx(mockCreatedTx.id);

      expect(result).toEqual(mockCreatedTx);
      expect(txLogRepository.findById).toHaveBeenCalledWith(mockCreatedTx.id);
    });

    it('should return null when TX not found', async () => {
      txLogRepository.findById.mockResolvedValue(null);

      const result = await service.getTx('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('assertMutable', () => {
    it('should pass for DRAFT transactions', async () => {
      txLogRepository.findById.mockResolvedValue({
        ...mockCreatedTx,
        txStatus: TxStatus.DRAFT,
      });

      await expect(
        service.assertMutable(mockCreatedTx.id),
      ).resolves.toBeUndefined();
    });

    it('should throw ImmutableTxException for POSTED transactions', async () => {
      txLogRepository.findById.mockResolvedValue({
        ...mockCreatedTx,
        txStatus: TxStatus.POSTED,
      });

      await expect(service.assertMutable(mockCreatedTx.id)).rejects.toThrow(
        ImmutableTxException,
      );
    });

    it('should throw ImmutableTxException for VOIDED transactions', async () => {
      txLogRepository.findById.mockResolvedValue({
        ...mockCreatedTx,
        txStatus: TxStatus.VOIDED,
      });

      await expect(service.assertMutable(mockCreatedTx.id)).rejects.toThrow(
        ImmutableTxException,
      );
    });

    it('should not throw when transaction does not exist', async () => {
      txLogRepository.findById.mockResolvedValue(null);

      await expect(
        service.assertMutable('non-existent-id'),
      ).resolves.toBeUndefined();
    });
  });

  describe('createTx — RefChain integration', () => {
    it('should call RefChainValidator.validateRefChain with TX type and ref fields', async () => {
      const cnDto: CreateTxDto = {
        txType: TxType.CN_RETURN,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        refInvoiceId: '550e8400-e29b-41d4-a716-446655440099',
        baseAmount: 1000,
      };

      await service.createTx(cnDto, mockUserId);

      expect(refChainValidatorService.validateRefChain).toHaveBeenCalledWith(
        TxType.CN_RETURN,
        {
          refJoId: null,
          refDoId: null,
          refInvoiceId: '550e8400-e29b-41d4-a716-446655440099',
          refGrId: null,
          refCnId: null,
        },
      );
    });

    it('should throw RefChainInvalidException when ref chain validation fails', async () => {
      const cnDto: CreateTxDto = {
        txType: TxType.CN_RETURN,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        baseAmount: 1000,
        // Missing required refInvoiceId for CN_RETURN
      };

      refChainValidatorService.validateRefChain.mockRejectedValue(
        new RefChainInvalidException(
          TxType.CN_RETURN,
          'null',
          'refInvoiceId is required for CN_RETURN but was not provided',
        ),
      );

      await expect(service.createTx(cnDto, mockUserId)).rejects.toThrow(
        RefChainInvalidException,
      );

      // Transaction should not be started after ref chain validation fails
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw RefChainInvalidException when referenced TX is not POSTED', async () => {
      const cnDto: CreateTxDto = {
        txType: TxType.CN_RETURN,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        refInvoiceId: '550e8400-e29b-41d4-a716-446655440099',
        baseAmount: 1000,
      };

      refChainValidatorService.validateRefChain.mockRejectedValue(
        new RefChainInvalidException(
          TxType.CN_RETURN,
          '550e8400-e29b-41d4-a716-446655440099',
          'refInvoiceId references TX 550e8400-e29b-41d4-a716-446655440099 which is not in POSTED status',
        ),
      );

      await expect(service.createTx(cnDto, mockUserId)).rejects.toThrow(
        RefChainInvalidException,
      );

      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should pass ref chain validation for TX types without rules', async () => {
      // GR_RECEIVE has no ref chain rules — should pass validation silently
      await service.createTx(mockCreateTxDto, mockUserId);

      expect(refChainValidatorService.validateRefChain).toHaveBeenCalledWith(
        TxType.GR_RECEIVE,
        {
          refJoId: null,
          refDoId: null,
          refInvoiceId: null,
          refGrId: null,
          refCnId: null,
        },
      );
      // Validation should not throw (mock returns undefined)
      expect(prismaService.$transaction).toHaveBeenCalled();
    });

    it('should validate ref chain after stock validation but before MA calculation', async () => {
      const callOrder: string[] = [];

      stockValidationService.validateStockAvailable.mockImplementation(async () => {
        callOrder.push('stockValidation');
      });

      refChainValidatorService.validateRefChain.mockImplementation(async () => {
        callOrder.push('refChainValidation');
      });

      maCalculationService.calculateNewMa.mockImplementation(async () => {
        callOrder.push('maCalculation');
        return { maBefore: 50, maAfter: 50, stockBefore: 100, stockAfter: 90 };
      });

      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: { create: jest.fn().mockResolvedValue(mockCreatedTx) },
          };
          return callback(mockClient);
        },
      );

      const saleDto: CreateTxDto = {
        txType: TxType.SALE_INVOICE,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        itemId: '550e8400-e29b-41d4-a716-446655440001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        qty: 10,
        unitCost: 50,
        totalCost: 500,
      };

      await service.createTx(saleDto, mockUserId);

      expect(callOrder.indexOf('stockValidation')).toBeLessThan(
        callOrder.indexOf('refChainValidation'),
      );
      expect(callOrder.indexOf('refChainValidation')).toBeLessThan(
        callOrder.indexOf('maCalculation'),
      );
    });
  });

  describe('createTx — DRAFT status (Approval workflow)', () => {
    it('should create all new TXs with DRAFT status by default', async () => {
      let capturedData: any;
      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: {
              create: jest.fn((args: any) => {
                capturedData = args.data;
                return Promise.resolve(mockCreatedTx);
              }),
            },
          };
          return callback(mockClient);
        },
      );

      await service.createTx(mockCreateTxDto, mockUserId);

      expect(capturedData.txStatus).toBe(TxStatus.DRAFT);
    });

    it('should return TX with DRAFT status', async () => {
      const result = await service.createTx(mockCreateTxDto, mockUserId);

      expect(result.txStatus).toBe(TxStatus.DRAFT);
    });

    it('should create non-stock TX with DRAFT status', async () => {
      const expenseDto: CreateTxDto = {
        txType: TxType.EXPENSE_RECORD,
        txDate: '2025-01-20T00:00:00Z',
        period: '2025-01',
        baseAmount: 2000,
      };

      let capturedData: any;
      (prismaService.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const mockClient = {
            txLog: {
              create: jest.fn((args: any) => {
                capturedData = args.data;
                return Promise.resolve({
                  ...mockCreatedTx,
                  txType: TxType.EXPENSE_RECORD,
                  txStatus: TxStatus.DRAFT,
                });
              }),
            },
          };
          return callback(mockClient);
        },
      );

      const result = await service.createTx(expenseDto, mockUserId);

      expect(capturedData.txStatus).toBe(TxStatus.DRAFT);
      expect(result.txStatus).toBe(TxStatus.DRAFT);
    });
  });
});
