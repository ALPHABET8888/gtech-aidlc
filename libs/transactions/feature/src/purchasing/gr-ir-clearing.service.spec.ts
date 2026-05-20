import { Test, TestingModule } from '@nestjs/testing';
import { GrIrClearingService } from './gr-ir-clearing.service';
import { GrIrClearingRepository } from '@autoflow/transactions-data-access';
import { ClearingNotOpenException } from '../exceptions';
import { Prisma } from '@prisma/client';

describe('GrIrClearingService', () => {
  let service: GrIrClearingService;
  let clearingRepo: jest.Mocked<GrIrClearingRepository>;

  beforeEach(async () => {
    const mockClearingRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByGrReturnTxId: jest.fn(),
      close: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrIrClearingService,
        { provide: GrIrClearingRepository, useValue: mockClearingRepo },
      ],
    }).compile();

    service = module.get<GrIrClearingService>(GrIrClearingService);
    clearingRepo = module.get(GrIrClearingRepository);
  });

  describe('openClearing', () => {
    it('should create a new clearing entry with OPEN status', async () => {
      const params = {
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'receive-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: 10,
        clearingAmount: 500,
      };

      const mockClearing = {
        id: 'clearing-1',
        ...params,
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(500),
        status: 'OPEN' as const,
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      };

      clearingRepo.create.mockResolvedValue(mockClearing);

      const result = await service.openClearing(params);

      expect(result).toEqual(mockClearing);
      expect(clearingRepo.create).toHaveBeenCalledWith({
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'receive-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(500),
        status: 'OPEN',
      });
    });
  });

  describe('closeByReplacement', () => {
    it('should close clearing with PPV = 0', async () => {
      const mockClearing = {
        id: 'clearing-1',
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'receive-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(500),
        status: 'OPEN' as const,
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      };

      const closedClearing = {
        ...mockClearing,
        status: 'CLOSED' as const,
        closedByTxId: 'replacement-tx-1',
        closedByType: 'GR_REPLACEMENT',
        ppvAmount: new Prisma.Decimal(0),
        closedAt: new Date(),
      };

      clearingRepo.findById.mockResolvedValue(mockClearing);
      clearingRepo.close.mockResolvedValue(closedClearing);

      const result = await service.closeByReplacement('clearing-1', 'replacement-tx-1');

      expect(result.status).toBe('CLOSED');
      expect(clearingRepo.close).toHaveBeenCalledWith(
        'clearing-1',
        'replacement-tx-1',
        'GR_REPLACEMENT',
        new Prisma.Decimal(0),
      );
    });

    it('should throw ClearingNotOpenException if clearing is not OPEN', async () => {
      const closedClearing = {
        id: 'clearing-1',
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'receive-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(500),
        status: 'CLOSED' as const,
        closedByTxId: 'some-tx',
        closedByType: 'CN_RETURN',
        ppvAmount: new Prisma.Decimal(10),
        createdAt: new Date(),
        closedAt: new Date(),
      };

      clearingRepo.findById.mockResolvedValue(closedClearing);

      await expect(
        service.closeByReplacement('clearing-1', 'replacement-tx-1'),
      ).rejects.toThrow(ClearingNotOpenException);
    });

    it('should throw ClearingNotOpenException if clearing not found', async () => {
      clearingRepo.findById.mockResolvedValue(null);

      await expect(
        service.closeByReplacement('nonexistent', 'replacement-tx-1'),
      ).rejects.toThrow(ClearingNotOpenException);
    });
  });

  describe('closeByCnReturn', () => {
    it('should close clearing with calculated PPV', async () => {
      const mockClearing = {
        id: 'clearing-1',
        grReturnTxId: 'return-tx-1',
        grReceiveTxId: 'receive-tx-1',
        vendorId: 'vendor-1',
        itemId: 'item-1',
        qty: new Prisma.Decimal(10),
        clearingAmount: new Prisma.Decimal(500),
        status: 'OPEN' as const,
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      };

      const closedClearing = {
        ...mockClearing,
        status: 'CLOSED' as const,
        closedByTxId: 'cn-tx-1',
        closedByType: 'CN_RETURN',
        ppvAmount: new Prisma.Decimal(-9),
        closedAt: new Date(),
      };

      clearingRepo.findById.mockResolvedValue(mockClearing);
      clearingRepo.close.mockResolvedValue(closedClearing);

      // PPV = clearingAmount (500) - cnAmount (509) = -9
      const result = await service.closeByCnReturn('clearing-1', 'cn-tx-1', 509);

      expect(result.status).toBe('CLOSED');
      expect(clearingRepo.close).toHaveBeenCalledWith(
        'clearing-1',
        'cn-tx-1',
        'CN_RETURN',
        new Prisma.Decimal(-9),
      );
    });

    it('should throw ClearingNotOpenException if clearing is not OPEN', async () => {
      clearingRepo.findById.mockResolvedValue(null);

      await expect(
        service.closeByCnReturn('nonexistent', 'cn-tx-1', 500),
      ).rejects.toThrow(ClearingNotOpenException);
    });
  });
});
