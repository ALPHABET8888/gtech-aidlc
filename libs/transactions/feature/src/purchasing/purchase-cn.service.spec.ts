import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseCnService } from './purchase-cn.service';
import { GrIrClearingService } from './gr-ir-clearing.service';
import { ApService } from '../ap-ar/ap.service';
import { TxType, TxStatus } from '@autoflow/shared-types';
import { Prisma } from '@prisma/client';

describe('PurchaseCnService', () => {
  let service: PurchaseCnService;
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
      getCurrentMa: jest.fn().mockResolvedValue(50),
    };

    stockService = {
      validateStockAvailability: jest.fn().mockResolvedValue({ valid: true }),
      getStockBalance: jest.fn().mockResolvedValue(80),
    };

    periodService = {
      validatePeriodOpen: jest.fn().mockResolvedValue(true),
      getCurrentPeriod: jest.fn().mockReturnValue('2025-01'),
    };

    const mockApService = {
      reduceApByCn: jest.fn(),
      findByTxId: jest.fn(),
    };

    const mockClearingService = {
      findById: jest.fn(),
      closeByCnReturn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseCnService,
        { provide: 'ITxLogService', useValue: txLogService },
        { provide: 'IMaCalculationService', useValue: maService },
        { provide: 'IStockValidationService', useValue: stockService },
        { provide: 'IPeriodService', useValue: periodService },
        { provide: ApService, useValue: mockApService },
        { provide: GrIrClearingService, useValue: mockClearingService },
      ],
    }).compile();

    service = module.get<PurchaseCnService>(PurchaseCnService);
    apService = module.get(ApService);
    clearingService = module.get(GrIrClearingService);
  });

  describe('createCnReturn', () => {
    const dto = {
      refGrReturnTxId: 'return-tx-1',
      clearingId: 'clearing-1',
    };

    beforeEach(() => {
      clearingService.findById.mockResolvedValue({
        id: 'clearing-1',
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'gr-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(500),
        status: 'OPEN',
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      } as any);
      txLogService.findById.mockResolvedValue({
        txId: 'return-tx-1',
        txType: TxType.GR_RETURN,
        status: TxStatus.POSTED,
      });
      txLogService.createTx.mockResolvedValue({
        txId: 'cn-return-tx-1',
        txType: TxType.CN_RETURN,
        status: TxStatus.DRAFT,
      });
      txLogService.postTx.mockResolvedValue({
        txId: 'cn-return-tx-1',
        txType: TxType.CN_RETURN,
        status: TxStatus.POSTED,
      });
      clearingService.closeByCnReturn.mockResolvedValue({
        id: 'clearing-1',
        status: 'CLOSED',
        ppvAmount: new Prisma.Decimal(-9),
      } as any);
      apService.findByTxId.mockResolvedValue({
        id: 'ap-1',
        vendorId: 'vendor-1',
        txId: 'gr-tx-1',
        txType: TxType.GR_RECEIVE,
        originalAmount: new Prisma.Decimal(5885),
        remainingAmount: new Prisma.Decimal(5885),
        vatAmount: new Prisma.Decimal(385),
        status: 'OPEN',
        taxInvoiceNo: 'TAX-001',
        dueDate: null,
        period: '2025-01',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      apService.reduceApByCn.mockResolvedValue({
        id: 'ap-1',
        status: 'PARTIAL',
        remainingAmount: new Prisma.Decimal(5385),
      } as any);
    });

    it('should validate period is open', async () => {
      await service.createCnReturn(dto, userId);
      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
    });

    it('should validate clearing exists and is OPEN', async () => {
      await service.createCnReturn(dto, userId);
      expect(clearingService.findById).toHaveBeenCalledWith('clearing-1');
    });

    it('should throw ClearingNotOpenException if clearing not found', async () => {
      clearingService.findById.mockResolvedValue(null);
      const { ClearingNotOpenException } = await import('../exceptions');
      await expect(service.createCnReturn(dto, userId)).rejects.toThrow(ClearingNotOpenException);
    });

    it('should throw ClearingNotOpenException if clearing is CLOSED', async () => {
      clearingService.findById.mockResolvedValue({
        id: 'clearing-1',
        status: 'CLOSED',
      } as any);
      const { ClearingNotOpenException } = await import('../exceptions');
      await expect(service.createCnReturn(dto, userId)).rejects.toThrow(ClearingNotOpenException);
    });

    it('should create TX with NO inventory impact (qty=0)', async () => {
      await service.createCnReturn(dto, userId);
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.CN_RETURN,
          qty: 0,
          unitCost: 0,
          totalCost: 0,
          warehouseId: null,
          apAmount: -500,
          parentTxId: 'return-tx-1',
        }),
      );
    });

    it('should close clearing by CN_RETURN with correct cnAmount', async () => {
      await service.createCnReturn(dto, userId);
      expect(clearingService.closeByCnReturn).toHaveBeenCalledWith(
        'clearing-1',
        'cn-return-tx-1',
        500,
      );
    });

    it('should find AP open item by GR receive TX ID', async () => {
      await service.createCnReturn(dto, userId);
      expect(apService.findByTxId).toHaveBeenCalledWith('gr-tx-1');
    });

    it('should reduce AP open item by CN amount', async () => {
      await service.createCnReturn(dto, userId);
      expect(apService.reduceApByCn).toHaveBeenCalledWith('ap-1', 500);
    });

    it('should return txEntry, apReduction, and clearing in response', async () => {
      const result = await service.createCnReturn(dto, userId);
      expect(result.txEntry).toEqual({
        id: 'cn-return-tx-1',
        txType: TxType.CN_RETURN,
        status: 'POSTED',
      });
      expect(result.apReduction).toEqual({
        openItemId: 'ap-1',
        reducedAmount: 500,
        newStatus: 'PARTIAL',
      });
      expect(result.clearing).toEqual({
        id: 'clearing-1',
        status: 'CLOSED',
        ppvAmount: -9,
      });
    });
  });

  describe('createCnPriceAdj', () => {
    const dto = {
      refGrTxId: 'gr-tx-1',
      adjustmentPerUnit: 5,
      qty: 100,
    };

    beforeEach(() => {
      txLogService.findById.mockResolvedValue({
        txId: 'gr-tx-1',
        txType: TxType.GR_RECEIVE,
        status: TxStatus.POSTED,
        itemId: 'item-1',
        warehouseId: 'wh-1',
        vendorId: 'vendor-1',
      });
      txLogService.createTx.mockResolvedValue({
        txId: 'cn-price-tx-1',
        txType: TxType.CN_PRICE_ADJ,
        status: TxStatus.DRAFT,
      });
      txLogService.postTx.mockResolvedValue({
        txId: 'cn-price-tx-1',
        txType: TxType.CN_PRICE_ADJ,
        status: TxStatus.POSTED,
      });
      maService.calculateMa.mockReturnValue({
        maBefore: 50,
        maAfter: 45,
        stockBefore: 80,
        stockAfter: 80,
      });
      apService.findByTxId.mockResolvedValue({
        id: 'ap-1',
        vendorId: 'vendor-1',
        txId: 'gr-tx-1',
        originalAmount: new Prisma.Decimal(5885),
        remainingAmount: new Prisma.Decimal(5885),
        status: 'OPEN',
      } as any);
      apService.reduceApByCn.mockResolvedValue({
        id: 'ap-1',
        status: 'PARTIAL',
        remainingAmount: new Prisma.Decimal(5385),
      } as any);
    });

    it('should validate period is open', async () => {
      await service.createCnPriceAdj(dto, userId);
      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
    });

    it('should validate referenced GR TX exists', async () => {
      await service.createCnPriceAdj(dto, userId);
      expect(txLogService.findById).toHaveBeenCalledWith('gr-tx-1');
    });

    it('should throw error if referenced GR TX not found', async () => {
      txLogService.findById.mockResolvedValue(null);
      await expect(service.createCnPriceAdj(dto, userId)).rejects.toThrow(
        'Referenced GR transaction gr-tx-1 not found',
      );
    });

    it('should check remaining stock for the item', async () => {
      await service.createCnPriceAdj(dto, userId);
      expect(stockService.getStockBalance).toHaveBeenCalledWith('item-1', 'wh-1');
    });

    it('should calculate inventory impact correctly (remaining vs sold)', async () => {
      // currentStock = 80, dto.qty = 100
      // remainingQty = min(80, 100) = 80
      // soldQty = 100 - 80 = 20
      const result = await service.createCnPriceAdj(dto, userId);
      expect(result.inventoryImpact).toEqual({
        remainingQty: 80,
        soldQty: 20,
        cogsAdjAmount: 100, // 5 * 20
      });
    });

    it('should create TX with price adjustment values', async () => {
      await service.createCnPriceAdj(dto, userId);
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.CN_PRICE_ADJ,
          qty: 0,
          unitCost: -5,
          totalCost: -500,
          apAmount: -500,
          parentTxId: 'gr-tx-1',
          itemId: 'item-1',
          warehouseId: 'wh-1',
        }),
      );
    });

    it('should reduce AP open item by total adjustment amount', async () => {
      await service.createCnPriceAdj(dto, userId);
      expect(apService.reduceApByCn).toHaveBeenCalledWith('ap-1', 500);
    });

    it('should return txEntry, apReduction, and inventoryImpact', async () => {
      const result = await service.createCnPriceAdj(dto, userId);
      expect(result.txEntry).toEqual({
        id: 'cn-price-tx-1',
        txType: TxType.CN_PRICE_ADJ,
        status: 'POSTED',
      });
      expect(result.apReduction.openItemId).toBe('ap-1');
      expect(result.apReduction.reducedAmount).toBe(500);
    });
  });

  describe('createCnDebt', () => {
    const dto = {
      refInvoiceTxId: 'gr-tx-1',
      amount: 200,
      reason: 'Early payment discount',
    };

    beforeEach(() => {
      txLogService.findById.mockResolvedValue({
        txId: 'gr-tx-1',
        txType: TxType.GR_RECEIVE,
        status: TxStatus.POSTED,
        vendorId: 'vendor-1',
      });
      txLogService.createTx.mockResolvedValue({
        txId: 'cn-debt-tx-1',
        txType: TxType.AP_CN_DEBT,
        status: TxStatus.DRAFT,
      });
      txLogService.postTx.mockResolvedValue({
        txId: 'cn-debt-tx-1',
        txType: TxType.AP_CN_DEBT,
        status: TxStatus.POSTED,
      });
      apService.findByTxId.mockResolvedValue({
        id: 'ap-1',
        vendorId: 'vendor-1',
        txId: 'gr-tx-1',
        originalAmount: new Prisma.Decimal(5885),
        remainingAmount: new Prisma.Decimal(5885),
        status: 'OPEN',
      } as any);
      apService.reduceApByCn.mockResolvedValue({
        id: 'ap-1',
        status: 'PARTIAL',
        remainingAmount: new Prisma.Decimal(5685),
      } as any);
    });

    it('should validate period is open', async () => {
      await service.createCnDebt(dto, userId);
      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
    });

    it('should validate referenced TX exists', async () => {
      await service.createCnDebt(dto, userId);
      expect(txLogService.findById).toHaveBeenCalledWith('gr-tx-1');
    });

    it('should throw error if referenced TX not found', async () => {
      txLogService.findById.mockResolvedValue(null);
      await expect(service.createCnDebt(dto, userId)).rejects.toThrow(
        'Referenced transaction gr-tx-1 not found',
      );
    });

    it('should create TX with AP reduction only (no inventory)', async () => {
      await service.createCnDebt(dto, userId);
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.AP_CN_DEBT,
          qty: 0,
          unitCost: 0,
          totalCost: 0,
          itemId: null,
          warehouseId: null,
          apAmount: -200,
          parentTxId: 'gr-tx-1',
        }),
      );
    });

    it('should reduce AP open item by specified amount', async () => {
      await service.createCnDebt(dto, userId);
      expect(apService.reduceApByCn).toHaveBeenCalledWith('ap-1', 200);
    });

    it('should return txEntry and apReduction', async () => {
      const result = await service.createCnDebt(dto, userId);
      expect(result.txEntry).toEqual({
        id: 'cn-debt-tx-1',
        txType: TxType.AP_CN_DEBT,
        status: 'POSTED',
      });
      expect(result.apReduction).toEqual({
        openItemId: 'ap-1',
        reducedAmount: 200,
        newStatus: 'PARTIAL',
      });
    });
  });
});
