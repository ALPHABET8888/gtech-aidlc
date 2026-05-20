import { Test, TestingModule } from '@nestjs/testing';
import { SalesCnService } from './sales-cn.service';
import { ArService } from '../ap-ar/ar.service';
import { ReturnCondition } from '../dto/sales';
import { ReturnQtyExceededException } from '../exceptions';
import { TxType } from '@autoflow/shared-types';
import { ApArStatus } from '@prisma/client';

describe('SalesCnService', () => {
  let service: SalesCnService;
  let txLogService: any;
  let maService: any;
  let stockService: any;
  let periodService: any;
  let arService: jest.Mocked<ArService>;

  beforeEach(async () => {
    txLogService = {
      createTx: jest.fn(),
      postTx: jest.fn(),
      findById: jest.fn(),
    };

    maService = {
      getCurrentMa: jest.fn(),
      calculateMa: jest.fn(),
    };

    stockService = {
      getStockBalance: jest.fn(),
      validateStockAvailability: jest.fn(),
    };

    periodService = {
      getCurrentPeriod: jest.fn().mockReturnValue('2025-01'),
      validatePeriodOpen: jest.fn().mockResolvedValue(undefined),
    };

    arService = {
      findByTxId: jest.fn(),
      reduceArByCn: jest.fn(),
    } as unknown as jest.Mocked<ArService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesCnService,
        { provide: 'ITxLogService', useValue: txLogService },
        { provide: 'IMaCalculationService', useValue: maService },
        { provide: 'IStockValidationService', useValue: stockService },
        { provide: 'IPeriodService', useValue: periodService },
        { provide: ArService, useValue: arService },
      ],
    }).compile();

    service = module.get<SalesCnService>(SalesCnService);
  });

  describe('createSalesReturn', () => {
    const baseDto = {
      refInvoiceTxId: 'invoice-tx-001',
      condition: ReturnCondition.GOOD,
      items: [{ itemId: 'item-001', qty: 2, warehouseId: 'wh-001' }],
      reason: 'สินค้าชำรุด',
    };

    const refInvoiceTx = {
      txId: 'invoice-tx-001',
      txType: TxType.SALE_INVOICE,
      qty: -5,
      cogsUnit: 100,
      customerId: 'customer-001',
    };

    beforeEach(() => {
      txLogService.findById.mockResolvedValue(refInvoiceTx);
      stockService.getStockBalance.mockResolvedValue(10);
      maService.getCurrentMa.mockResolvedValue(100);
      maService.calculateMa.mockReturnValue({ newMa: 100, newQty: 12 });
      txLogService.createTx.mockResolvedValue({ txId: 'cn-tx-001' });
      txLogService.postTx.mockResolvedValue({ txId: 'cn-tx-001' });
      arService.findByTxId.mockResolvedValue({
        id: 'ar-001',
        status: ApArStatus.OPEN,
        originalAmount: 500 as any,
        remainingAmount: 500 as any,
      } as any);
      arService.reduceArByCn.mockResolvedValue({
        id: 'ar-001',
        status: ApArStatus.PARTIAL,
        remainingAmount: 300 as any,
      } as any);
    });

    it('should create CN_SALES_RETURN with good condition (stock increase + MA recalc)', async () => {
      const result = await service.createSalesReturn(baseDto, 'user-001');

      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
      expect(txLogService.findById).toHaveBeenCalledWith('invoice-tx-001');
      expect(stockService.getStockBalance).toHaveBeenCalledWith('item-001', 'wh-001');
      expect(maService.getCurrentMa).toHaveBeenCalledWith('item-001', 'wh-001');
      expect(maService.calculateMa).toHaveBeenCalled();
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.CN_SALES_RETURN,
          qty: 2, // positive = stock-in
          unitCost: 100,
          warehouseId: 'wh-001',
        }),
      );
      expect(txLogService.postTx).toHaveBeenCalledWith('cn-tx-001', 'user-001');
      expect(arService.reduceArByCn).toHaveBeenCalledWith('ar-001', 200);
      expect(result.txEntry.txType).toBe(TxType.CN_SALES_RETURN);
      expect(result.txEntry.status).toBe('POSTED');
      expect(result.arReduction.reducedAmount).toBe(200);
    });

    it('should create CN_SALES_RETURN with damaged_total condition (no stock increase)', async () => {
      const dto = { ...baseDto, condition: ReturnCondition.DAMAGED_TOTAL };

      const result = await service.createSalesReturn(dto, 'user-001');

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.CN_SALES_RETURN,
          qty: 0, // no stock increase for damaged
          warehouseId: null, // no warehouse impact
        }),
      );
      expect(maService.calculateMa).not.toHaveBeenCalled();
      expect(result.txEntry.status).toBe('POSTED');
    });

    it('should throw ReturnQtyExceededException when return qty exceeds original', async () => {
      const dto = {
        ...baseDto,
        items: [{ itemId: 'item-001', qty: 10, warehouseId: 'wh-001' }],
      };

      await expect(service.createSalesReturn(dto, 'user-001')).rejects.toThrow(
        ReturnQtyExceededException,
      );
    });

    it('should throw when referenced invoice TX not found', async () => {
      txLogService.findById.mockResolvedValue(null);

      await expect(service.createSalesReturn(baseDto, 'user-001')).rejects.toThrow(
        /not found/,
      );
    });

    it('should throw when AR Open Item not found for the return', async () => {
      arService.findByTxId.mockResolvedValue(null);

      await expect(service.createSalesReturn(baseDto, 'user-001')).rejects.toThrow(
        /not found/,
      );
    });

    it('should allow return qty equal to original sale qty (boundary)', async () => {
      const dto = {
        ...baseDto,
        items: [{ itemId: 'item-001', qty: 5, warehouseId: 'wh-001' }],
      };

      const result = await service.createSalesReturn(dto, 'user-001');

      expect(result.txEntry.status).toBe('POSTED');
      expect(arService.reduceArByCn).toHaveBeenCalledWith('ar-001', 500);
    });

    it('should calculate AR reduction as cogsUnit * returnQty', async () => {
      // cogsUnit=100, qty=2 → AR reduction = 200
      const result = await service.createSalesReturn(baseDto, 'user-001');

      expect(result.arReduction.reducedAmount).toBe(200);
    });

    it('should pass MA recalculation input correctly for good condition', async () => {
      await service.createSalesReturn(baseDto, 'user-001');

      expect(maService.calculateMa).toHaveBeenCalledWith({
        currentQty: 10, // from getStockBalance
        currentMa: 100, // from getCurrentMa
        qtyChange: 2, // return qty
        unitCost: 100, // cogsUnit from original invoice
      });
    });

    it('should set arAmount as negative (AR reduction) in TX entry', async () => {
      await service.createSalesReturn(baseDto, 'user-001');

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          arAmount: -200, // negative = reduce AR
        }),
      );
    });

    it('should set parentTxId to the referenced invoice TX', async () => {
      await service.createSalesReturn(baseDto, 'user-001');

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          parentTxId: 'invoice-tx-001',
        }),
      );
    });
  });

  describe('createSalesPriceAdj', () => {
    const baseDto = {
      refInvoiceTxId: 'invoice-tx-002',
      adjustmentAmount: 50,
      reason: 'ส่วนลดพิเศษ',
    };

    const refInvoiceTx = {
      txId: 'invoice-tx-002',
      txType: TxType.SALE_INVOICE,
      qty: -5,
      customerId: 'customer-002',
    };

    beforeEach(() => {
      txLogService.findById.mockResolvedValue(refInvoiceTx);
      txLogService.createTx.mockResolvedValue({ txId: 'cn-price-001' });
      arService.findByTxId.mockResolvedValue({
        id: 'ar-002',
        status: ApArStatus.OPEN,
        originalAmount: 500 as any,
        remainingAmount: 500 as any,
      } as any);
      arService.reduceArByCn.mockResolvedValue({
        id: 'ar-002',
        status: ApArStatus.PARTIAL,
        remainingAmount: 450 as any,
      } as any);
    });

    it('should create CN_SALES_PRICE with DRAFT status (requires Manager approval)', async () => {
      const result = await service.createSalesPriceAdj(baseDto, 'user-002');

      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
      expect(txLogService.findById).toHaveBeenCalledWith('invoice-tx-002');
      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.CN_SALES_PRICE,
          qty: 0, // no inventory impact
          itemId: null, // no item
          warehouseId: null,
          arAmount: -50,
        }),
      );
      // Should NOT call postTx — stays DRAFT
      expect(txLogService.postTx).not.toHaveBeenCalled();
      expect(arService.reduceArByCn).toHaveBeenCalledWith('ar-002', 50);
      expect(result.txEntry.txType).toBe(TxType.CN_SALES_PRICE);
      expect(result.txEntry.status).toBe('DRAFT');
      expect(result.arReduction.reducedAmount).toBe(50);
    });

    it('should throw when referenced invoice TX not found', async () => {
      txLogService.findById.mockResolvedValue(null);

      await expect(service.createSalesPriceAdj(baseDto, 'user-002')).rejects.toThrow(
        /not found/,
      );
    });

    it('should throw when AR Open Item not found for the invoice', async () => {
      arService.findByTxId.mockResolvedValue(null);

      await expect(service.createSalesPriceAdj(baseDto, 'user-002')).rejects.toThrow(
        /not found/,
      );
    });

    it('should not call stock or MA services (no inventory impact)', async () => {
      await service.createSalesPriceAdj(baseDto, 'user-002');

      expect(stockService.getStockBalance).not.toHaveBeenCalled();
      expect(maService.getCurrentMa).not.toHaveBeenCalled();
      expect(maService.calculateMa).not.toHaveBeenCalled();
    });

    it('should set parentTxId to the referenced invoice TX', async () => {
      await service.createSalesPriceAdj(baseDto, 'user-002');

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          parentTxId: 'invoice-tx-002',
        }),
      );
    });

    it('should use customerId from the referenced invoice TX', async () => {
      await service.createSalesPriceAdj(baseDto, 'user-002');

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'customer-002',
        }),
      );
    });
  });
});
