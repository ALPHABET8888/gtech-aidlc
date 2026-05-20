import { Test, TestingModule } from '@nestjs/testing';
import { SalesCnController } from './sales-cn.controller';
import { SalesCnService } from './sales-cn.service';
import { ReturnCondition } from '../dto/sales';

describe('SalesCnController', () => {
  let controller: SalesCnController;
  let salesCnService: jest.Mocked<SalesCnService>;

  beforeEach(async () => {
    salesCnService = {
      createSalesReturn: jest.fn(),
      createSalesPriceAdj: jest.fn(),
    } as unknown as jest.Mocked<SalesCnService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesCnController],
      providers: [
        { provide: SalesCnService, useValue: salesCnService },
      ],
    }).compile();

    controller = module.get<SalesCnController>(SalesCnController);
  });

  describe('createSalesReturn', () => {
    it('should delegate to SalesCnService.createSalesReturn with good condition', async () => {
      const dto = {
        refInvoiceTxId: 'invoice-tx-001',
        condition: ReturnCondition.GOOD,
        items: [{ itemId: 'item-001', qty: 2, warehouseId: 'wh-001' }],
        reason: 'สินค้าชำรุด',
      };
      const user = { userId: 'user-001', username: 'supervisor', displayName: 'Supervisor', roles: [], isActive: true };
      const expectedResult = {
        txEntry: { id: 'tx-cn-001', txType: 'CN_SALES_RETURN', status: 'POSTED' },
        arReduction: { openItemId: 'ar-001', reducedAmount: 200, newStatus: 'PARTIAL' },
      };

      salesCnService.createSalesReturn.mockResolvedValue(expectedResult);

      const result = await controller.createSalesReturn(dto, user as any);

      expect(salesCnService.createSalesReturn).toHaveBeenCalledWith(dto, 'user-001');
      expect(result).toEqual(expectedResult);
    });

    it('should delegate to SalesCnService.createSalesReturn with damaged_total condition', async () => {
      const dto = {
        refInvoiceTxId: 'invoice-tx-002',
        condition: ReturnCondition.DAMAGED_TOTAL,
        items: [{ itemId: 'item-002', qty: 3, warehouseId: 'wh-001' }],
        reason: 'สินค้าเสียหายทั้งหมด',
      };
      const user = { userId: 'user-002', username: 'manager', displayName: 'Manager', roles: [], isActive: true };
      const expectedResult = {
        txEntry: { id: 'tx-cn-002', txType: 'CN_SALES_RETURN', status: 'POSTED' },
        arReduction: { openItemId: 'ar-002', reducedAmount: 300, newStatus: 'CLOSED' },
      };

      salesCnService.createSalesReturn.mockResolvedValue(expectedResult);

      const result = await controller.createSalesReturn(dto, user as any);

      expect(salesCnService.createSalesReturn).toHaveBeenCalledWith(dto, 'user-002');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('createSalesPriceAdj', () => {
    it('should delegate to SalesCnService.createSalesPriceAdj', async () => {
      const dto = {
        refInvoiceTxId: 'invoice-tx-003',
        adjustmentAmount: 50,
        reason: 'ส่วนลดพิเศษ',
      };
      const user = { userId: 'user-003', username: 'manager', displayName: 'Manager', roles: [], isActive: true };
      const expectedResult = {
        txEntry: { id: 'tx-cn-003', txType: 'CN_SALES_PRICE', status: 'DRAFT' },
        arReduction: { openItemId: 'ar-003', reducedAmount: 50 },
      };

      salesCnService.createSalesPriceAdj.mockResolvedValue(expectedResult);

      const result = await controller.createSalesPriceAdj(dto, user as any);

      expect(salesCnService.createSalesPriceAdj).toHaveBeenCalledWith(dto, 'user-003');
      expect(result).toEqual(expectedResult);
    });
  });
});
