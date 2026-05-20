import { Test, TestingModule } from '@nestjs/testing';
import { GoodsReceiptService } from './goods-receipt.service';
import { GrIrClearingService } from './gr-ir-clearing.service';
import { ApService } from '../ap-ar/ap.service';
import { TxType, TxStatus } from '@autoflow/shared-types';
import { Prisma } from '@prisma/client';

describe('GoodsReceiptService', () => {
  let service: GoodsReceiptService;
  let txLogService: any;
  let maService: any;
  let stockService: any;
  let periodService: any;
  let apService: jest.Mocked<ApService>;
  let clearingService: jest.Mocked<GrIrClearingService>;

  const userId = 'user-123';

  beforeEach(async () => {
    txLogService = {
      createTx: jest.fn(),
      postTx: jest.fn(),
      findById: jest.fn(),
    };

    maService = {
      calculateMa: jest.fn(),
      calculateStockOut: jest.fn(),
      getCurrentMa: jest.fn().mockResolvedValue(100),
    };

    stockService = {
      validateStockAvailability: jest.fn().mockResolvedValue({ valid: true, availableQty: 1000, requestedQty: 10 }),
      getStockBalance: jest.fn().mockResolvedValue(1000),
    };

    periodService = {
      validatePeriodOpen: jest.fn().mockResolvedValue(true),
      getCurrentPeriod: jest.fn().mockReturnValue('2025-01'),
    };

    const mockApService = {
      createApOpenItem: jest.fn(),
    };

    const mockClearingService = {
      openClearing: jest.fn(),
      closeByReplacement: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptService,
        { provide: 'ITxLogService', useValue: txLogService },
        { provide: 'IMaCalculationService', useValue: maService },
        { provide: 'IStockValidationService', useValue: stockService },
        { provide: 'IPeriodService', useValue: periodService },
        { provide: ApService, useValue: mockApService },
        { provide: GrIrClearingService, useValue: mockClearingService },
      ],
    }).compile();

    service = module.get<GoodsReceiptService>(GoodsReceiptService);
    apService = module.get(ApService);
    clearingService = module.get(GrIrClearingService);
  });

  describe('createGoodsReceipt', () => {
    const dto = {
      vendorId: 'vendor-1',
      taxInvoiceNo: 'TAX-2025-001',
      warehouseId: 'wh-1',
      items: [{ itemId: 'item-1', qty: 100, unitCost: 50, landedCost: 5 }],
      period: '2025-01',
    };

    beforeEach(() => {
      txLogService.createTx.mockResolvedValue({
        txId: 'tx-1',
        txType: TxType.GR_RECEIVE,
        status: TxStatus.DRAFT,
        maBefore: 0,
        maAfter: 0,
      });
      txLogService.postTx.mockResolvedValue({
        txId: 'tx-1',
        txType: TxType.GR_RECEIVE,
        status: TxStatus.POSTED,
        maBefore: 100,
        maAfter: 52.73,
      });
      maService.calculateMa.mockReturnValue({
        maBefore: 100,
        maAfter: 52.73,
        stockBefore: 1000,
        stockAfter: 1100,
        totalValueAfter: 58000,
      });
      apService.createApOpenItem.mockResolvedValue({
        id: 'ap-1',
        vendorId: 'vendor-1',
        txId: 'tx-1',
        txType: TxType.GR_RECEIVE,
        originalAmount: new Prisma.Decimal(5885),
        remainingAmount: new Prisma.Decimal(5885),
        vatAmount: new Prisma.Decimal(385),
        status: 'OPEN',
        taxInvoiceNo: 'TAX-2025-001',
        dueDate: null,
        period: '2025-01',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });

    it('should validate period is open', async () => {
      await service.createGoodsReceipt(dto, userId);
      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
    });

    it('should calculate MA for each item', async () => {
      await service.createGoodsReceipt(dto, userId);
      expect(maService.calculateMa).toHaveBeenCalledWith({
        currentQty: 1000,
        currentMa: 100,
        qtyChange: 100,
        unitCost: 55, // unitCost + landedCost
      });
    });

    it('should create TX log entry with GR_RECEIVE type', async () => {
      await service.createGoodsReceipt(dto, userId);
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.GR_RECEIVE,
          qty: 100,
          unitCost: 55,
          totalCost: 5500,
          vendorId: 'vendor-1',
        }),
      );
    });

    it('should create AP Open Item with VAT', async () => {
      await service.createGoodsReceipt(dto, userId);
      // totalCost = 100 * 55 = 5500, VAT = 5500 * 0.07 = 385, grand = 5885
      expect(apService.createApOpenItem).toHaveBeenCalledWith({
        vendorId: 'vendor-1',
        txId: 'tx-1',
        txType: TxType.GR_RECEIVE,
        originalAmount: 5885,
        vatAmount: 385,
        taxInvoiceNo: 'TAX-2025-001',
        period: '2025-01',
      });
    });

    it('should return txEntry and apOpenItem in response', async () => {
      const result = await service.createGoodsReceipt(dto, userId);
      expect(result.txEntry).toEqual({
        id: 'tx-1',
        txType: TxType.GR_RECEIVE,
        status: 'POSTED',
        maBefore: 100,
        maAfter: 52.73,
      });
      expect(result.apOpenItem).toEqual({
        id: 'ap-1',
        status: 'OPEN',
        originalAmount: 5885,
      });
    });
  });

  describe('createGoodsReturn', () => {
    const dto = {
      refGrTxId: 'gr-tx-1',
      vendorId: 'vendor-1',
      warehouseId: 'wh-1',
      items: [{ itemId: 'item-1', qty: 10 }],
      reason: 'Defective goods',
    };

    beforeEach(() => {
      txLogService.findById.mockResolvedValue({
        txId: 'gr-tx-1',
        txType: TxType.GR_RECEIVE,
        status: TxStatus.POSTED,
      });
      txLogService.createTx.mockResolvedValue({
        txId: 'return-tx-1',
        txType: TxType.GR_RETURN,
        status: TxStatus.DRAFT,
      });
      txLogService.postTx.mockResolvedValue({
        txId: 'return-tx-1',
        txType: TxType.GR_RETURN,
        status: TxStatus.POSTED,
      });
      maService.calculateStockOut.mockReturnValue({
        maBefore: 100,
        maAfter: 100,
        stockBefore: 1000,
        stockAfter: 990,
      });
      clearingService.openClearing.mockResolvedValue({
        id: 'clearing-1',
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'gr-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(1000),
        status: 'OPEN',
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      } as any);
    });

    it('should validate period is open', async () => {
      await service.createGoodsReturn(dto, userId);
      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
    });

    it('should validate stock availability', async () => {
      await service.createGoodsReturn(dto, userId);
      expect(stockService.validateStockAvailability).toHaveBeenCalledWith('item-1', 'wh-1', 10);
    });

    it('should create TX with negative qty for stock decrease', async () => {
      await service.createGoodsReturn(dto, userId);
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.GR_RETURN,
          qty: -10,
          parentTxId: 'gr-tx-1',
        }),
      );
    });

    it('should open GR/IR clearing', async () => {
      await service.createGoodsReturn(dto, userId);
      expect(clearingService.openClearing).toHaveBeenCalledWith({
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'gr-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: 10,
        clearingAmount: 1000, // 10 * MA(100)
      });
    });

    it('should return txEntry and clearing in response', async () => {
      const result = await service.createGoodsReturn(dto, userId);
      expect(result.txEntry.txType).toBe(TxType.GR_RETURN);
      expect(result.txEntry.status).toBe('POSTED');
      expect(result.clearing.status).toBe('OPEN');
      expect(result.clearing.clearingAmount).toBe(1000);
    });

    it('should throw GrAlreadyReturnedException if GR not found', async () => {
      txLogService.findById.mockResolvedValue(null);
      const { GrAlreadyReturnedException } = await import('../exceptions');
      await expect(service.createGoodsReturn(dto, userId)).rejects.toThrow(GrAlreadyReturnedException);
    });
  });

  describe('receiveReplacement', () => {
    const dto = {
      refGrReturnTxId: 'return-tx-1',
      clearingId: 'clearing-1',
      warehouseId: 'wh-1',
      items: [{ itemId: 'item-1', qty: 10 }],
    };

    beforeEach(() => {
      clearingService.findById.mockResolvedValue({
        id: 'clearing-1',
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'gr-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(1000),
        status: 'OPEN',
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      } as any);
      txLogService.createTx.mockResolvedValue({
        txId: 'replacement-tx-1',
        txType: TxType.GR_REPLACEMENT,
        status: TxStatus.DRAFT,
      });
      txLogService.postTx.mockResolvedValue({
        txId: 'replacement-tx-1',
        txType: TxType.GR_REPLACEMENT,
        status: TxStatus.POSTED,
        maBefore: 100,
        maAfter: 99.5,
      });
      maService.calculateMa.mockReturnValue({
        maBefore: 100,
        maAfter: 99.5,
        stockBefore: 990,
        stockAfter: 1000,
      });
      clearingService.closeByReplacement.mockResolvedValue({
        id: 'clearing-1',
        status: 'CLOSED',
        ppvAmount: new Prisma.Decimal(0),
      } as any);
    });

    it('should validate period is open', async () => {
      await service.receiveReplacement(dto, userId);
      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
    });

    it('should validate clearing exists and is OPEN', async () => {
      await service.receiveReplacement(dto, userId);
      expect(clearingService.findById).toHaveBeenCalledWith('clearing-1');
    });

    it('should create TX with unit cost from clearing', async () => {
      await service.receiveReplacement(dto, userId);
      // unitCost = clearingAmount / qty = 1000 / 10 = 100
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.GR_REPLACEMENT,
          qty: 10,
          unitCost: 100,
          vendorId: 'vendor-1',
          parentTxId: 'return-tx-1',
        }),
      );
    });

    it('should close clearing by replacement', async () => {
      await service.receiveReplacement(dto, userId);
      expect(clearingService.closeByReplacement).toHaveBeenCalledWith(
        'clearing-1',
        'replacement-tx-1',
      );
    });

    it('should return txEntry and closed clearing in response', async () => {
      const result = await service.receiveReplacement(dto, userId);
      expect(result.txEntry.txType).toBe(TxType.GR_REPLACEMENT);
      expect(result.txEntry.status).toBe('POSTED');
      expect(result.clearing.status).toBe('CLOSED');
      expect(result.clearing.ppvAmount).toBe(0);
    });

    it('should throw ClearingNotOpenException if clearing not found', async () => {
      clearingService.findById.mockResolvedValue(null);
      const { ClearingNotOpenException } = await import('../exceptions');
      await expect(service.receiveReplacement(dto, userId)).rejects.toThrow(ClearingNotOpenException);
    });

    it('should throw ClearingNotOpenException if clearing is CLOSED', async () => {
      clearingService.findById.mockResolvedValue({
        id: 'clearing-1',
        status: 'CLOSED',
      } as any);
      const { ClearingNotOpenException } = await import('../exceptions');
      await expect(service.receiveReplacement(dto, userId)).rejects.toThrow(ClearingNotOpenException);
    });
  });
});
