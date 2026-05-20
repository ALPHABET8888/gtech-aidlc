import { Test, TestingModule } from '@nestjs/testing';
import { ApArStatus, Prisma } from '@prisma/client';
import { PaymentMatchingService } from './payment-matching.service';
import { ApOpenItemRepository, ArOpenItemRepository } from '@autoflow/transactions-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import { MakeApPaymentDto, PaymentMethod, ReceiveArPaymentDto } from '../dto/ap-ar';
import { PaymentExceedsBalanceException, OpenItemNotFoundException } from '../exceptions';
import { AllocationSumMismatchException } from '../exceptions/allocation-sum-mismatch.exception';

describe('PaymentMatchingService', () => {
  let service: PaymentMatchingService;
  let apOpenItemRepository: jest.Mocked<ApOpenItemRepository>;
  let arOpenItemRepository: jest.Mocked<ArOpenItemRepository>;
  let prismaService: { aPPaymentAllocation: { create: jest.Mock }; aRPaymentAllocation: { create: jest.Mock } };
  let txLogService: { createTx: jest.Mock; postTx: jest.Mock };

  beforeEach(async () => {
    apOpenItemRepository = {
      findById: jest.fn(),
      updateRemainingAndStatus: jest.fn(),
    } as unknown as jest.Mocked<ApOpenItemRepository>;

    arOpenItemRepository = {
      findById: jest.fn(),
      updateRemainingAndStatus: jest.fn(),
    } as unknown as jest.Mocked<ArOpenItemRepository>;

    prismaService = {
      aPPaymentAllocation: { create: jest.fn() },
      aRPaymentAllocation: { create: jest.fn() },
    };

    txLogService = {
      createTx: jest.fn().mockResolvedValue({ txId: 'tx-001', status: 'DRAFT' }),
      postTx: jest.fn().mockResolvedValue({ txId: 'tx-001', status: 'POSTED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMatchingService,
        { provide: ApOpenItemRepository, useValue: apOpenItemRepository },
        { provide: ArOpenItemRepository, useValue: arOpenItemRepository },
        { provide: PrismaService, useValue: prismaService },
        { provide: 'ITxLogService', useValue: txLogService },
      ],
    }).compile();

    service = module.get<PaymentMatchingService>(PaymentMatchingService);
  });

  describe('makeApPayment', () => {
    const baseDto: MakeApPaymentDto = {
      vendorId: 'vendor-001',
      totalAmount: 1000,
      allocations: [
        { openItemId: 'ap-item-001', amount: 600 },
        { openItemId: 'ap-item-002', amount: 400 },
      ],
      paymentMethod: PaymentMethod.TRANSFER,
      paymentRef: 'CHQ-001',
    };

    it('should process AP payment successfully with multiple allocations', async () => {
      apOpenItemRepository.findById
        .mockResolvedValueOnce({
          id: 'ap-item-001',
          vendorId: 'vendor-001',
          originalAmount: new Prisma.Decimal(1000),
          remainingAmount: new Prisma.Decimal(1000),
          status: ApArStatus.OPEN,
        } as any)
        .mockResolvedValueOnce({
          id: 'ap-item-002',
          vendorId: 'vendor-001',
          originalAmount: new Prisma.Decimal(500),
          remainingAmount: new Prisma.Decimal(500),
          status: ApArStatus.OPEN,
        } as any);

      apOpenItemRepository.updateRemainingAndStatus.mockResolvedValue({} as any);
      prismaService.aPPaymentAllocation.create.mockResolvedValue({} as any);

      const result = await service.makeApPayment(baseDto, 'user-001');

      expect(result.txEntry.txType).toBe('AP_PAYMENT');
      expect(result.txEntry.status).toBe('POSTED');
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0].openItemId).toBe('ap-item-001');
      expect(result.allocations[0].amount).toBe(600);
      expect(result.allocations[0].newStatus).toBe(ApArStatus.PARTIAL);
      expect(result.allocations[1].openItemId).toBe('ap-item-002');
      expect(result.allocations[1].amount).toBe(400);
      expect(result.allocations[1].newStatus).toBe(ApArStatus.PARTIAL);
    });

    it('should set status to CLOSED when payment equals remaining balance', async () => {
      apOpenItemRepository.findById.mockResolvedValueOnce({
        id: 'ap-item-001',
        vendorId: 'vendor-001',
        originalAmount: new Prisma.Decimal(1000),
        remainingAmount: new Prisma.Decimal(1000),
        status: ApArStatus.OPEN,
      } as any);

      apOpenItemRepository.updateRemainingAndStatus.mockResolvedValue({} as any);
      prismaService.aPPaymentAllocation.create.mockResolvedValue({} as any);

      const dto: MakeApPaymentDto = {
        vendorId: 'vendor-001',
        totalAmount: 1000,
        allocations: [{ openItemId: 'ap-item-001', amount: 1000 }],
        paymentMethod: PaymentMethod.TRANSFER,
      };

      const result = await service.makeApPayment(dto, 'user-001');

      expect(result.allocations[0].newStatus).toBe(ApArStatus.CLOSED);
    });

    it('should throw AllocationSumMismatchException when sum ≠ totalAmount', async () => {
      const dto: MakeApPaymentDto = {
        vendorId: 'vendor-001',
        totalAmount: 1000,
        allocations: [
          { openItemId: 'ap-item-001', amount: 600 },
          { openItemId: 'ap-item-002', amount: 300 }, // sum = 900 ≠ 1000
        ],
        paymentMethod: PaymentMethod.TRANSFER,
      };

      await expect(service.makeApPayment(dto, 'user-001')).rejects.toThrow(
        AllocationSumMismatchException,
      );
    });

    it('should throw OpenItemNotFoundException when open item does not exist', async () => {
      apOpenItemRepository.findById.mockResolvedValueOnce(null);

      const dto: MakeApPaymentDto = {
        vendorId: 'vendor-001',
        totalAmount: 500,
        allocations: [{ openItemId: 'non-existent', amount: 500 }],
        paymentMethod: PaymentMethod.TRANSFER,
      };

      await expect(service.makeApPayment(dto, 'user-001')).rejects.toThrow(
        OpenItemNotFoundException,
      );
    });

    it('should throw PaymentExceedsBalanceException when allocation > remaining', async () => {
      apOpenItemRepository.findById.mockResolvedValueOnce({
        id: 'ap-item-001',
        vendorId: 'vendor-001',
        originalAmount: new Prisma.Decimal(500),
        remainingAmount: new Prisma.Decimal(200),
        status: ApArStatus.PARTIAL,
      } as any);

      const dto: MakeApPaymentDto = {
        vendorId: 'vendor-001',
        totalAmount: 300,
        allocations: [{ openItemId: 'ap-item-001', amount: 300 }],
        paymentMethod: PaymentMethod.TRANSFER,
      };

      await expect(service.makeApPayment(dto, 'user-001')).rejects.toThrow(
        PaymentExceedsBalanceException,
      );
    });
  });

  describe('receiveArPayment', () => {
    const baseDto: ReceiveArPaymentDto = {
      customerId: 'customer-001',
      totalAmount: 535,
      allocations: [{ openItemId: 'ar-item-001', amount: 535 }],
      paymentMethod: PaymentMethod.CASH,
    };

    it('should process AR payment successfully', async () => {
      arOpenItemRepository.findById.mockResolvedValueOnce({
        id: 'ar-item-001',
        customerId: 'customer-001',
        originalAmount: new Prisma.Decimal(535),
        remainingAmount: new Prisma.Decimal(535),
        status: ApArStatus.OPEN,
      } as any);

      arOpenItemRepository.updateRemainingAndStatus.mockResolvedValue({} as any);
      prismaService.aRPaymentAllocation.create.mockResolvedValue({} as any);

      const result = await service.receiveArPayment(baseDto, 'user-001');

      expect(result.txEntry.txType).toBe('AR_RECEIVE');
      expect(result.txEntry.status).toBe('POSTED');
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].newStatus).toBe(ApArStatus.CLOSED);
    });

    it('should handle partial AR payment correctly', async () => {
      arOpenItemRepository.findById.mockResolvedValueOnce({
        id: 'ar-item-001',
        customerId: 'customer-001',
        originalAmount: new Prisma.Decimal(1000),
        remainingAmount: new Prisma.Decimal(1000),
        status: ApArStatus.OPEN,
      } as any);

      arOpenItemRepository.updateRemainingAndStatus.mockResolvedValue({} as any);
      prismaService.aRPaymentAllocation.create.mockResolvedValue({} as any);

      const dto: ReceiveArPaymentDto = {
        customerId: 'customer-001',
        totalAmount: 500,
        allocations: [{ openItemId: 'ar-item-001', amount: 500 }],
        paymentMethod: PaymentMethod.TRANSFER,
      };

      const result = await service.receiveArPayment(dto, 'user-001');

      expect(result.allocations[0].newStatus).toBe(ApArStatus.PARTIAL);
    });

    it('should throw AllocationSumMismatchException when sum ≠ totalAmount', async () => {
      const dto: ReceiveArPaymentDto = {
        customerId: 'customer-001',
        totalAmount: 1000,
        allocations: [
          { openItemId: 'ar-item-001', amount: 400 },
          { openItemId: 'ar-item-002', amount: 500 }, // sum = 900 ≠ 1000
        ],
        paymentMethod: PaymentMethod.CASH,
      };

      await expect(service.receiveArPayment(dto, 'user-001')).rejects.toThrow(
        AllocationSumMismatchException,
      );
    });

    it('should throw OpenItemNotFoundException when AR open item does not exist', async () => {
      arOpenItemRepository.findById.mockResolvedValueOnce(null);

      const dto: ReceiveArPaymentDto = {
        customerId: 'customer-001',
        totalAmount: 500,
        allocations: [{ openItemId: 'non-existent', amount: 500 }],
        paymentMethod: PaymentMethod.CASH,
      };

      await expect(service.receiveArPayment(dto, 'user-001')).rejects.toThrow(
        OpenItemNotFoundException,
      );
    });

    it('should throw PaymentExceedsBalanceException when allocation > remaining', async () => {
      arOpenItemRepository.findById.mockResolvedValueOnce({
        id: 'ar-item-001',
        customerId: 'customer-001',
        originalAmount: new Prisma.Decimal(500),
        remainingAmount: new Prisma.Decimal(100),
        status: ApArStatus.PARTIAL,
      } as any);

      const dto: ReceiveArPaymentDto = {
        customerId: 'customer-001',
        totalAmount: 200,
        allocations: [{ openItemId: 'ar-item-001', amount: 200 }],
        paymentMethod: PaymentMethod.CASH,
      };

      await expect(service.receiveArPayment(dto, 'user-001')).rejects.toThrow(
        PaymentExceedsBalanceException,
      );
    });
  });
});
