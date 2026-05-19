import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StockTransferService } from './stock-transfer.service';
import { TransferOrderRepository } from '@autoflow/warehouse-data-access';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { TransferStatus } from '@prisma/client';
import { TxType } from '@autoflow/shared-types';

describe('StockTransferService', () => {
  let service: StockTransferService;
  let transferOrderRepository: jest.Mocked<TransferOrderRepository>;
  let stockValidationService: {
    getStockBalance: jest.Mock;
    validateStockAvailability: jest.Mock;
    isStockFrozen: jest.Mock;
  };
  let maService: {
    getCurrentMa: jest.Mock;
    calculateMa: jest.Mock;
    calculateStockOut: jest.Mock;
  };
  let txLogService: {
    createTx: jest.Mock;
    postTx: jest.Mock;
    voidTx: jest.Mock;
    findById: jest.Mock;
    findByReference: jest.Mock;
  };
  let periodService: {
    validatePeriodOpen: jest.Mock;
    getCurrentPeriod: jest.Mock;
    closePeriod: jest.Mock;
    getPeriodInfo: jest.Mock;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockSourceWarehouseId = '22222222-2222-2222-2222-222222222222';
  const mockDestWarehouseId = '33333333-3333-3333-3333-333333333333';
  const mockItemId = '44444444-4444-4444-4444-444444444444';
  const mockTransferId = '55555555-5555-5555-5555-555555555555';
  const mockTxId = 'tx-66666666-6666-6666-6666-666666666666';

  beforeEach(async () => {
    transferOrderRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findBySourceOrDestWarehouse: jest.fn(),
      updateStatus: jest.fn(),
      createLine: jest.fn(),
      createLines: jest.fn(),
      updateLinesTxId: jest.fn(),
      findLinesByTransferId: jest.fn(),
    } as unknown as jest.Mocked<TransferOrderRepository>;

    stockValidationService = {
      getStockBalance: jest.fn().mockResolvedValue(100),
      validateStockAvailability: jest.fn().mockResolvedValue({
        valid: true,
        availableQty: 100,
        requestedQty: 10,
      }),
      isStockFrozen: jest.fn().mockResolvedValue(false),
    };

    maService = {
      getCurrentMa: jest.fn().mockResolvedValue(50),
      calculateMa: jest.fn().mockReturnValue({
        maBefore: 50,
        maAfter: 50,
        stockBefore: 0,
        stockAfter: 10,
        totalValueAfter: 500,
      }),
      calculateStockOut: jest.fn(),
    };

    txLogService = {
      createTx: jest.fn().mockResolvedValue({
        txId: mockTxId,
        txType: TxType.ADJ_TRANSFER,
        status: 'DRAFT',
      }),
      postTx: jest.fn().mockResolvedValue({
        txId: mockTxId,
        status: 'POSTED',
      }),
      voidTx: jest.fn(),
      findById: jest.fn(),
      findByReference: jest.fn(),
    };

    periodService = {
      validatePeriodOpen: jest.fn(),
      getCurrentPeriod: jest.fn().mockReturnValue('2025-01'),
      closePeriod: jest.fn(),
      getPeriodInfo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTransferService,
        { provide: TransferOrderRepository, useValue: transferOrderRepository },
        { provide: WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE, useValue: stockValidationService },
        { provide: WAREHOUSE_DI_TOKENS.MA_SERVICE, useValue: maService },
        { provide: WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE, useValue: txLogService },
        { provide: WAREHOUSE_DI_TOKENS.PERIOD_SERVICE, useValue: periodService },
      ],
    }).compile();

    service = module.get<StockTransferService>(StockTransferService);
  });

  describe('initiateTransfer', () => {
    const createDto = {
      sourceWarehouseId: mockSourceWarehouseId,
      destWarehouseId: mockDestWarehouseId,
      lines: [{ itemId: mockItemId, qty: 10 }],
      notes: 'Test transfer',
    };

    const mockTransferOrder = {
      id: mockTransferId,
      sourceWarehouseId: mockSourceWarehouseId,
      destWarehouseId: mockDestWarehouseId,
      status: TransferStatus.DRAFT,
      initiatedBy: mockUserId,
      postedAt: null,
      notes: 'Test transfer',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockTransferOrderWithLines = {
      ...mockTransferOrder,
      status: TransferStatus.POSTED,
      postedAt: new Date(),
      lines: [
        {
          id: 'line-1',
          transferId: mockTransferId,
          itemId: mockItemId,
          qty: 10,
          unitCost: 50,
          txId: mockTxId,
          createdAt: new Date(),
        },
      ],
    };

    beforeEach(() => {
      transferOrderRepository.create.mockResolvedValue(mockTransferOrder as any);
      transferOrderRepository.createLines.mockResolvedValue({ count: 1 });
      transferOrderRepository.updateStatus.mockResolvedValue({
        ...mockTransferOrder,
        status: TransferStatus.POSTED,
        postedAt: new Date(),
      } as any);
      transferOrderRepository.updateLinesTxId.mockResolvedValue({ count: 1 });
      transferOrderRepository.findById.mockResolvedValue(mockTransferOrderWithLines as any);
    });

    it('should create a transfer order and return POSTED status (happy path)', async () => {
      const result = await service.initiateTransfer(createDto, mockUserId);

      expect(result).toBeDefined();
      expect(result!.status).toBe(TransferStatus.POSTED);
      expect(result!.lines).toHaveLength(1);
    });

    it('should throw BadRequestException when source equals destination warehouse', async () => {
      const sameWarehouseDto = {
        ...createDto,
        destWarehouseId: mockSourceWarehouseId,
      };

      await expect(
        service.initiateTransfer(sameWarehouseDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no lines are provided', async () => {
      const emptyLinesDto = {
        ...createDto,
        lines: [],
      };

      await expect(
        service.initiateTransfer(emptyLinesDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnprocessableEntityException when stock is insufficient', async () => {
      stockValidationService.validateStockAvailability.mockRejectedValue(
        new Error('Insufficient stock'),
      );

      await expect(
        service.initiateTransfer(createDto, mockUserId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should capture unit_cost as MA at source warehouse', async () => {
      maService.getCurrentMa.mockResolvedValue(75);

      await service.initiateTransfer(createDto, mockUserId);

      expect(maService.getCurrentMa).toHaveBeenCalledWith(
        mockItemId,
        mockSourceWarehouseId,
      );
      expect(transferOrderRepository.createLines).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ unitCost: 75 }),
        ]),
      );
    });

    it('should POST a single ADJ_TRANSFER TX via TxLogService', async () => {
      await service.initiateTransfer(createDto, mockUserId);

      expect(txLogService.createTx).toHaveBeenCalledTimes(1);
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.ADJ_TRANSFER,
          warehouseId: mockSourceWarehouseId,
        }),
      );
      expect(txLogService.postTx).toHaveBeenCalledWith(mockTxId, mockUserId);
    });

    it('should record tx_id on all TransferLines', async () => {
      await service.initiateTransfer(createDto, mockUserId);

      expect(transferOrderRepository.updateLinesTxId).toHaveBeenCalledWith(
        mockTransferId,
        mockTxId,
      );
    });

    it('should validate stock availability for each line item', async () => {
      const multiLineDto = {
        ...createDto,
        lines: [
          { itemId: mockItemId, qty: 5 },
          { itemId: 'item-2', qty: 3 },
        ],
      };

      await service.initiateTransfer(multiLineDto, mockUserId);

      expect(stockValidationService.validateStockAvailability).toHaveBeenCalledTimes(2);
      expect(stockValidationService.validateStockAvailability).toHaveBeenCalledWith(
        mockItemId,
        mockSourceWarehouseId,
        5,
      );
      expect(stockValidationService.validateStockAvailability).toHaveBeenCalledWith(
        'item-2',
        mockSourceWarehouseId,
        3,
      );
    });

    it('should create transfer order with correct parameters', async () => {
      await service.initiateTransfer(createDto, mockUserId);

      expect(transferOrderRepository.create).toHaveBeenCalledWith({
        sourceWarehouseId: mockSourceWarehouseId,
        destWarehouseId: mockDestWarehouseId,
        initiatedBy: mockUserId,
        notes: 'Test transfer',
      });
    });

    it('should update status to POSTED after TX is posted', async () => {
      await service.initiateTransfer(createDto, mockUserId);

      expect(transferOrderRepository.updateStatus).toHaveBeenCalledWith(
        mockTransferId,
        TransferStatus.POSTED,
        expect.objectContaining({ postedAt: expect.any(Date) }),
      );
    });
  });

  describe('getTransfer', () => {
    const mockTransferWithLines = {
      id: mockTransferId,
      sourceWarehouseId: mockSourceWarehouseId,
      destWarehouseId: mockDestWarehouseId,
      status: TransferStatus.POSTED,
      initiatedBy: mockUserId,
      postedAt: new Date(),
      notes: 'Test transfer',
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [
        {
          id: 'line-1',
          transferId: mockTransferId,
          itemId: mockItemId,
          qty: 10,
          unitCost: 50,
          txId: mockTxId,
          createdAt: new Date(),
        },
      ],
    };

    it('should return transfer with lines', async () => {
      transferOrderRepository.findById.mockResolvedValue(mockTransferWithLines as any);

      const result = await service.getTransfer(mockTransferId);

      expect(result).toEqual(mockTransferWithLines);
      expect(transferOrderRepository.findById).toHaveBeenCalledWith(mockTransferId);
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      transferOrderRepository.findById.mockResolvedValue(null);

      await expect(service.getTransfer('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listTransfers', () => {
    it('should return paginated results', async () => {
      const mockResult = {
        data: [],
        total: 0,
      };
      transferOrderRepository.findBySourceOrDestWarehouse.mockResolvedValue(mockResult);

      const result = await service.listTransfers({
        sourceWarehouseId: mockSourceWarehouseId,
        page: 1,
        limit: 20,
      });

      expect(result).toEqual(mockResult);
      expect(transferOrderRepository.findBySourceOrDestWarehouse).toHaveBeenCalledWith({
        sourceWarehouseId: mockSourceWarehouseId,
        page: 1,
        limit: 20,
      });
    });

    it('should pass filter parameters to repository', async () => {
      const mockResult = { data: [], total: 0 };
      transferOrderRepository.findBySourceOrDestWarehouse.mockResolvedValue(mockResult);

      await service.listTransfers({
        sourceWarehouseId: mockSourceWarehouseId,
        destWarehouseId: mockDestWarehouseId,
        status: TransferStatus.POSTED,
        page: 2,
        limit: 10,
      });

      expect(transferOrderRepository.findBySourceOrDestWarehouse).toHaveBeenCalledWith({
        sourceWarehouseId: mockSourceWarehouseId,
        destWarehouseId: mockDestWarehouseId,
        status: TransferStatus.POSTED,
        page: 2,
        limit: 10,
      });
    });
  });
});
