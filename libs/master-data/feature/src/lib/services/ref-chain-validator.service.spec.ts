import { Test, TestingModule } from '@nestjs/testing';
import { TxType, TxStatus } from '@prisma/client';
import { RefChainValidatorService } from './ref-chain-validator.service';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { RefChainInvalidException } from '@autoflow/shared-errors';

describe('RefChainValidatorService', () => {
  let service: RefChainValidatorService;
  let txLogRepository: jest.Mocked<TxLogRepository>;

  const mockPostedTx = (id: string, txType: TxType = TxType.SALE_INVOICE) => ({
    id,
    txType,
    txStatus: TxStatus.POSTED,
    txDate: new Date(),
    period: '2025-01',
    itemId: null,
    warehouseId: null,
    qty: null,
    unitCost: null,
    totalCost: null,
    maBefore: null,
    maAfter: null,
    stockBefore: null,
    stockAfter: null,
    vendorId: null,
    customerId: null,
    refJoId: null,
    refDoId: null,
    refInvoiceId: null,
    refGrId: null,
    refCnId: null,
    parentTxId: null,
    taxInvoiceNo: null,
    baseAmount: null,
    vatAmount: null,
    vatType: null,
    arAmount: null,
    apAmount: null,
    apArStatus: null,
    cogsUnit: null,
    reason: null,
    approvedBy: null,
    approvedAt: null,
    createdBy: 'user-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const mockDraftTx = (id: string, txType: TxType = TxType.GR_RECEIVE) => ({
    ...mockPostedTx(id, txType),
    txStatus: TxStatus.DRAFT,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefChainValidatorService,
        {
          provide: TxLogRepository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RefChainValidatorService>(RefChainValidatorService);
    txLogRepository = module.get(TxLogRepository);

    // Trigger onModuleInit to register default rules
    service.onModuleInit();
  });

  describe('registerRule', () => {
    it('should register a new rule for a TX type', () => {
      service.registerRule(TxType.TEMP_DO, ['refJoId']);

      const rules = service.getRules();
      expect(rules.get(TxType.TEMP_DO)).toEqual(['refJoId']);
    });

    it('should merge rules when registering multiple times for the same TX type', () => {
      service.registerRule(TxType.TEMP_DO, ['refJoId']);
      service.registerRule(TxType.TEMP_DO, ['refDoId']);

      const rules = service.getRules();
      expect(rules.get(TxType.TEMP_DO)).toEqual(['refJoId', 'refDoId']);
    });

    it('should not duplicate refs when registering the same ref twice', () => {
      service.registerRule(TxType.TEMP_DO, ['refJoId']);
      service.registerRule(TxType.TEMP_DO, ['refJoId']);

      const rules = service.getRules();
      expect(rules.get(TxType.TEMP_DO)).toEqual(['refJoId']);
    });
  });

  describe('onModuleInit — default rules', () => {
    it('should register CN types requiring refInvoiceId', () => {
      const rules = service.getRules();
      expect(rules.get(TxType.CN_RETURN)).toContain('refInvoiceId');
      expect(rules.get(TxType.CN_PRICE_ADJ)).toContain('refInvoiceId');
      expect(rules.get(TxType.CN_SALES_RETURN)).toContain('refInvoiceId');
      expect(rules.get(TxType.CN_SALES_PRICE)).toContain('refInvoiceId');
    });

    it('should register GR_RETURN requiring refGrId', () => {
      const rules = service.getRules();
      expect(rules.get(TxType.GR_RETURN)).toContain('refGrId');
    });

    it('should register INVOICE_FROM_DO requiring refDoId', () => {
      const rules = service.getRules();
      expect(rules.get(TxType.INVOICE_FROM_DO)).toContain('refDoId');
    });
  });

  describe('validateRefChain', () => {
    describe('valid chain', () => {
      it('should pass when TX type has no registered rules', async () => {
        await expect(
          service.validateRefChain(TxType.GR_RECEIVE, {}),
        ).resolves.toBeUndefined();

        expect(txLogRepository.findById).not.toHaveBeenCalled();
      });

      it('should pass when all required refs exist and are POSTED', async () => {
        const invoiceId = 'invoice-001';
        txLogRepository.findById.mockResolvedValue(
          mockPostedTx(invoiceId, TxType.SALE_INVOICE) as any,
        );

        await expect(
          service.validateRefChain(TxType.CN_RETURN, {
            refInvoiceId: invoiceId,
          }),
        ).resolves.toBeUndefined();

        expect(txLogRepository.findById).toHaveBeenCalledWith(invoiceId);
      });

      it('should pass for GR_RETURN with valid POSTED GR reference', async () => {
        const grId = 'gr-001';
        txLogRepository.findById.mockResolvedValue(
          mockPostedTx(grId, TxType.GR_RECEIVE) as any,
        );

        await expect(
          service.validateRefChain(TxType.GR_RETURN, { refGrId: grId }),
        ).resolves.toBeUndefined();

        expect(txLogRepository.findById).toHaveBeenCalledWith(grId);
      });

      it('should pass for INVOICE_FROM_DO with valid POSTED DO reference', async () => {
        const doId = 'do-001';
        txLogRepository.findById.mockResolvedValue(
          mockPostedTx(doId, TxType.TEMP_DO) as any,
        );

        await expect(
          service.validateRefChain(TxType.INVOICE_FROM_DO, { refDoId: doId }),
        ).resolves.toBeUndefined();

        expect(txLogRepository.findById).toHaveBeenCalledWith(doId);
      });
    });

    describe('missing ref', () => {
      it('should throw when required ref field is not provided (null)', async () => {
        await expect(
          service.validateRefChain(TxType.CN_RETURN, { refInvoiceId: null }),
        ).rejects.toThrow(RefChainInvalidException);
      });

      it('should throw when required ref field is not in refFields at all', async () => {
        await expect(
          service.validateRefChain(TxType.CN_RETURN, {}),
        ).rejects.toThrow(RefChainInvalidException);
      });

      it('should throw when referenced TX does not exist in DB', async () => {
        txLogRepository.findById.mockResolvedValue(null);

        await expect(
          service.validateRefChain(TxType.GR_RETURN, {
            refGrId: 'non-existent-id',
          }),
        ).rejects.toThrow(RefChainInvalidException);
      });
    });

    describe('ref not POSTED', () => {
      it('should throw when referenced TX exists but is in DRAFT status', async () => {
        const grId = 'gr-draft-001';
        txLogRepository.findById.mockResolvedValue(
          mockDraftTx(grId, TxType.GR_RECEIVE) as any,
        );

        await expect(
          service.validateRefChain(TxType.GR_RETURN, { refGrId: grId }),
        ).rejects.toThrow(RefChainInvalidException);
      });

      it('should throw when referenced TX is VOIDED', async () => {
        const invoiceId = 'invoice-voided';
        txLogRepository.findById.mockResolvedValue({
          ...mockPostedTx(invoiceId, TxType.SALE_INVOICE),
          txStatus: TxStatus.VOIDED,
        } as any);

        await expect(
          service.validateRefChain(TxType.CN_RETURN, {
            refInvoiceId: invoiceId,
          }),
        ).rejects.toThrow(RefChainInvalidException);
      });
    });

    describe('exception details', () => {
      it('should include violation details about missing ref', async () => {
        try {
          await service.validateRefChain(TxType.CN_RETURN, {});
          fail('Expected RefChainInvalidException');
        } catch (error) {
          expect(error).toBeInstanceOf(RefChainInvalidException);
          const message = (error as RefChainInvalidException).message;
          expect(message).toContain('refInvoiceId');
          expect(message).toContain('CN_RETURN');
        }
      });

      it('should include violation details about NOT_POSTED ref', async () => {
        const grId = 'gr-draft-002';
        txLogRepository.findById.mockResolvedValue(
          mockDraftTx(grId, TxType.GR_RECEIVE) as any,
        );

        try {
          await service.validateRefChain(TxType.GR_RETURN, { refGrId: grId });
          fail('Expected RefChainInvalidException');
        } catch (error) {
          expect(error).toBeInstanceOf(RefChainInvalidException);
          const message = (error as RefChainInvalidException).message;
          expect(message).toContain('not in POSTED status');
          expect(message).toContain(grId);
        }
      });
    });
  });
});
