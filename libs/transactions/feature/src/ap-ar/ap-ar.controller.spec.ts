import { Test, TestingModule } from '@nestjs/testing';
import { ApArController } from './ap-ar.controller';
import { ApService } from './ap.service';
import { ArService } from './ar.service';
import { PaymentMatchingService } from './payment-matching.service';
import { PaymentMethod } from '../dto/ap-ar';
import { ApArStatus } from '@prisma/client';

describe('ApArController', () => {
  let controller: ApArController;
  let paymentMatchingService: jest.Mocked<PaymentMatchingService>;
  let apService: jest.Mocked<ApService>;
  let arService: jest.Mocked<ArService>;

  beforeEach(async () => {
    paymentMatchingService = {
      makeApPayment: jest.fn(),
      receiveArPayment: jest.fn(),
    } as unknown as jest.Mocked<PaymentMatchingService>;

    apService = {
      getOpenApItems: jest.fn(),
    } as unknown as jest.Mocked<ApService>;

    arService = {
      getOpenArItems: jest.fn(),
    } as unknown as jest.Mocked<ArService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApArController],
      providers: [
        { provide: ApService, useValue: apService },
        { provide: ArService, useValue: arService },
        { provide: PaymentMatchingService, useValue: paymentMatchingService },
      ],
    }).compile();

    controller = module.get<ApArController>(ApArController);
  });

  describe('makeApPayment', () => {
    it('should delegate to PaymentMatchingService.makeApPayment', async () => {
      const dto = {
        vendorId: 'vendor-001',
        totalAmount: 5000,
        allocations: [
          { openItemId: 'ap-001', amount: 3000 },
          { openItemId: 'ap-002', amount: 2000 },
        ],
        paymentMethod: PaymentMethod.TRANSFER,
        paymentRef: 'CHQ-001',
      };
      const user = { userId: 'user-001', username: 'admin', displayName: 'Admin', roles: [], isActive: true };
      const expectedResult = {
        txEntry: { id: 'tx-001', txType: 'AP_PAYMENT', status: 'POSTED' },
        allocations: [
          { openItemId: 'ap-001', amount: 3000, newStatus: ApArStatus.CLOSED },
          { openItemId: 'ap-002', amount: 2000, newStatus: ApArStatus.PARTIAL },
        ],
      };

      paymentMatchingService.makeApPayment.mockResolvedValue(expectedResult);

      const result = await controller.makeApPayment(dto, user as any);

      expect(paymentMatchingService.makeApPayment).toHaveBeenCalledWith(dto, 'user-001');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('receiveArPayment', () => {
    it('should delegate to PaymentMatchingService.receiveArPayment', async () => {
      const dto = {
        customerId: 'customer-001',
        totalAmount: 535,
        allocations: [{ openItemId: 'ar-001', amount: 535 }],
        paymentMethod: PaymentMethod.CASH,
      };
      const user = { userId: 'user-002', username: 'cashier', displayName: 'Cashier', roles: [], isActive: true };
      const expectedResult = {
        txEntry: { id: 'tx-002', txType: 'AR_RECEIVE', status: 'POSTED' },
        allocations: [
          { openItemId: 'ar-001', amount: 535, newStatus: ApArStatus.CLOSED },
        ],
      };

      paymentMatchingService.receiveArPayment.mockResolvedValue(expectedResult);

      const result = await controller.receiveArPayment(dto, user as any);

      expect(paymentMatchingService.receiveArPayment).toHaveBeenCalledWith(dto, 'user-002');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('listApOpenItems', () => {
    it('should delegate to ApService.getOpenApItems with query params', async () => {
      const query = { vendorId: 'vendor-001', status: ApArStatus.OPEN, page: 1, limit: 20 };
      const expectedResult = {
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      apService.getOpenApItems.mockResolvedValue(expectedResult);

      const result = await controller.listApOpenItems(query as any);

      expect(apService.getOpenApItems).toHaveBeenCalledWith({
        vendorId: 'vendor-001',
        status: ApArStatus.OPEN,
        page: 1,
        limit: 20,
      });
      expect(result).toEqual(expectedResult);
    });
  });

  describe('listArOpenItems', () => {
    it('should delegate to ArService.getOpenArItems with query params', async () => {
      const query = { customerId: 'customer-001', status: ApArStatus.PARTIAL, page: 2, limit: 10 };
      const expectedResult = {
        data: [],
        meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
      };

      arService.getOpenArItems.mockResolvedValue(expectedResult);

      const result = await controller.listArOpenItems(query as any);

      expect(arService.getOpenArItems).toHaveBeenCalledWith({
        customerId: 'customer-001',
        status: ApArStatus.PARTIAL,
        page: 2,
        limit: 10,
      });
      expect(result).toEqual(expectedResult);
    });
  });
});
