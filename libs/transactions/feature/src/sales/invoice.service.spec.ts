import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceService } from './invoice.service';
import { JobOrderRepository } from '@autoflow/transactions-data-access';
import { ArService } from '../ap-ar/ar.service';
import { JOStatus as PrismaJOStatus, ApArStatus, JobOrder, Prisma } from '@prisma/client';
import { TxType, TxStatus } from '@autoflow/shared-types';
import {
  JoNotDoneException,
  DuplicateTempDoException,
  DuplicateInvoiceException,
} from '../exceptions';
import { IssueTempDoDto } from '../dto/sales/issue-temp-do.dto';
import { IssueInvoiceDto } from '../dto/sales/issue-invoice.dto';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let jobOrderRepository: jest.Mocked<JobOrderRepository>;
  let arService: jest.Mocked<ArService>;
  let txLogService: any;
  let maCalculationService: any;
  let stockValidationService: any;
  let periodService: any;

  const userId = '880e8400-e29b-41d4-a716-446655440000';
  const joId = '550e8400-e29b-41d4-a716-446655440000';
  const customerId = '660e8400-e29b-41d4-a716-446655440000';
  const warehouseId = '990e8400-e29b-41d4-a716-446655440000';
  const itemId = '770e8400-e29b-41d4-a716-446655440000';

  const mockDoneJobOrder: JobOrder = {
    id: joId,
    joNumber: 'JO-202501-0001',
    customerId,
    status: PrismaJOStatus.DONE,
    hasTempDo: false,
    tempDoId: null,
    invoiceId: null,
    items: [{ itemId, qty: 5, unitPrice: 100, description: 'Test item' }],
    totalAmount: new Prisma.Decimal('500.00'),
    vatAmount: new Prisma.Decimal('35.00'),
    grandTotal: new Prisma.Decimal('535.00'),
    notes: null,
    createdBy: userId,
    createdAt: new Date('2025-01-20T10:00:00Z'),
    updatedAt: new Date('2025-01-20T10:00:00Z'),
  } as unknown as JobOrder;

  const mockTxEntry = {
    txId: 'tx-001',
    txType: TxType.TEMP_DO,
    txDate: '2025-01-20T10:00:00Z',
    period: '2025-01',
    status: TxStatus.POSTED,
    itemId,
    warehouseId,
    qty: -5,
    unitCost: 100,
    totalCost: -500,
    maBefore: 100,
    maAfter: 100,
    stockBefore: 1000,
    stockAfter: 995,
    cogsUnit: 100,
    vendorId: null,
    customerId,
    apAmount: 0,
    arAmount: 535,
    parentTxId: null,
    createdBy: userId,
    postedBy: userId,
  };

  beforeEach(async () => {
    const mockJobOrderRepo = {
      findById: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findByJoNumber: jest.fn(),
      updateStatus: jest.fn(),
    };

    const mockArService = {
      createArOpenItem: jest.fn(),
      reduceArByCn: jest.fn(),
      getOpenArItems: jest.fn(),
    };

    txLogService = {
      createTx: jest.fn().mockResolvedValue({ ...mockTxEntry, status: TxStatus.DRAFT }),
      postTx: jest.fn().mockResolvedValue(mockTxEntry),
      findById: jest.fn(),
      findByReference: jest.fn(),
      voidTx: jest.fn(),
    };

    maCalculationService = {
      calculateMa: jest.fn(),
      calculateStockOut: jest.fn().mockReturnValue({
        maBefore: 100,
        maAfter: 100,
        stockBefore: 1000,
        stockAfter: 995,
        totalValueAfter: 99500,
      }),
      getCurrentMa: jest.fn().mockResolvedValue(100),
    };

    stockValidationService = {
      validateStockAvailability: jest.fn().mockResolvedValue({
        valid: true,
        availableQty: 1000,
        requestedQty: 5,
      }),
      getStockBalance: jest.fn().mockResolvedValue(1000),
      isStockFrozen: jest.fn().mockResolvedValue(false),
    };

    periodService = {
      validatePeriodOpen: jest.fn().mockResolvedValue(true),
      getCurrentPeriod: jest.fn().mockReturnValue('2025-01'),
      closePeriod: jest.fn(),
      getPeriodInfo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: JobOrderRepository, useValue: mockJobOrderRepo },
        { provide: ArService, useValue: mockArService },
        { provide: 'ITxLogService', useValue: txLogService },
        { provide: 'IMaCalculationService', useValue: maCalculationService },
        { provide: 'IStockValidationService', useValue: stockValidationService },
        { provide: 'IPeriodService', useValue: periodService },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
    jobOrderRepository = module.get(JobOrderRepository);
    arService = module.get(ArService);
  });

  describe('issueTempDO', () => {
    const dto: IssueTempDoDto = {
      warehouseId,
      items: [{ itemId, qty: 5 }],
    };

    it('should issue TEMP_DO for a DONE job order', async () => {
      jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
      jobOrderRepository.update.mockResolvedValue({
        ...mockDoneJobOrder,
        hasTempDo: true,
        tempDoId: 'tx-001',
      });
      arService.createArOpenItem.mockResolvedValue({
        id: 'ar-001',
        customerId,
        txId: 'tx-001',
        txType: TxType.TEMP_DO,
        originalAmount: new Prisma.Decimal('535.00'),
        remainingAmount: new Prisma.Decimal('535.00'),
        vatAmount: new Prisma.Decimal('35.00'),
        status: ApArStatus.OPEN,
        taxInvoiceNo: null,
        dueDate: null,
        period: '2025-01',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await service.issueTempDO(joId, dto, userId);

      expect(result.txEntry.txType).toBe(TxType.TEMP_DO);
      expect(result.txEntry.status).toBe(TxStatus.POSTED);
      expect(result.arOpenItem.id).toBe('ar-001');
      expect(result.arOpenItem.status).toBe(ApArStatus.OPEN);
      expect(result.arOpenItem.originalAmount).toBe(535);
    });

    it('should throw JoNotDoneException when JO is not DONE', async () => {
      const openJo = { ...mockDoneJobOrder, status: PrismaJOStatus.OPEN };
      jobOrderRepository.findById.mockResolvedValue(openJo);

      await expect(service.issueTempDO(joId, dto, userId)).rejects.toThrow(
        JoNotDoneException,
      );
    });

    it('should throw JoNotDoneException when JO not found', async () => {
      jobOrderRepository.findById.mockResolvedValue(null);

      await expect(service.issueTempDO(joId, dto, userId)).rejects.toThrow(
        JoNotDoneException,
      );
    });

    it('should throw DuplicateTempDoException when JO already has TEMP_DO', async () => {
      const joWithTempDo = { ...mockDoneJobOrder, hasTempDo: true, tempDoId: 'existing-tx' };
      jobOrderRepository.findById.mockResolvedValue(joWithTempDo);

      await expect(service.issueTempDO(joId, dto, userId)).rejects.toThrow(
        DuplicateTempDoException,
      );
    });

    it('should validate stock availability for all items', async () => {
      jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
      jobOrderRepository.update.mockResolvedValue(mockDoneJobOrder);
      arService.createArOpenItem.mockResolvedValue({
        id: 'ar-001',
        status: ApArStatus.OPEN,
        originalAmount: new Prisma.Decimal('535.00'),
      } as any);

      await service.issueTempDO(joId, dto, userId);

      expect(stockValidationService.validateStockAvailability).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        5,
      );
    });

    it('should validate period is open', async () => {
      jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
      jobOrderRepository.update.mockResolvedValue(mockDoneJobOrder);
      arService.createArOpenItem.mockResolvedValue({
        id: 'ar-001',
        status: ApArStatus.OPEN,
        originalAmount: new Prisma.Decimal('535.00'),
      } as any);

      await service.issueTempDO(joId, dto, userId);

      expect(periodService.validatePeriodOpen).toHaveBeenCalledWith('2025-01');
    });

    it('should update JO with hasTempDo=true and tempDoId', async () => {
      jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
      jobOrderRepository.update.mockResolvedValue(mockDoneJobOrder);
      arService.createArOpenItem.mockResolvedValue({
        id: 'ar-001',
        status: ApArStatus.OPEN,
        originalAmount: new Prisma.Decimal('535.00'),
      } as any);

      await service.issueTempDO(joId, dto, userId);

      expect(jobOrderRepository.update).toHaveBeenCalledWith(joId, {
        hasTempDo: true,
        tempDoId: 'tx-001',
      });
    });
  });

  describe('issueInvoice', () => {
    const dto: IssueInvoiceDto = {
      warehouseId,
      items: [{ itemId, qty: 5 }],
    };

    describe('Path B: SALE_INVOICE (no TEMP_DO)', () => {
      it('should issue SALE_INVOICE when hasTempDo=false', async () => {
        jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
        jobOrderRepository.update.mockResolvedValue(mockDoneJobOrder);

        const saleInvoiceTx = { ...mockTxEntry, txType: TxType.SALE_INVOICE };
        txLogService.createTx.mockResolvedValue({ ...saleInvoiceTx, status: TxStatus.DRAFT });
        txLogService.postTx.mockResolvedValue(saleInvoiceTx);

        arService.createArOpenItem.mockResolvedValue({
          id: 'ar-002',
          status: ApArStatus.OPEN,
          originalAmount: new Prisma.Decimal('535.00'),
        } as any);

        const result = await service.issueInvoice(joId, dto, userId);

        expect(result.arOpenItem.id).toBe('ar-002');
        expect(result.arOpenItem.originalAmount).toBe(535);
      });

      it('should validate stock for SALE_INVOICE', async () => {
        jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
        jobOrderRepository.update.mockResolvedValue(mockDoneJobOrder);
        txLogService.postTx.mockResolvedValue({ ...mockTxEntry, txType: TxType.SALE_INVOICE });
        arService.createArOpenItem.mockResolvedValue({
          id: 'ar-002',
          status: ApArStatus.OPEN,
          originalAmount: new Prisma.Decimal('535.00'),
        } as any);

        await service.issueInvoice(joId, dto, userId);

        expect(stockValidationService.validateStockAvailability).toHaveBeenCalledWith(
          itemId,
          warehouseId,
          5,
        );
      });

      it('should create AR Open Item for SALE_INVOICE', async () => {
        jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
        jobOrderRepository.update.mockResolvedValue(mockDoneJobOrder);
        txLogService.postTx.mockResolvedValue({ ...mockTxEntry, txType: TxType.SALE_INVOICE });
        arService.createArOpenItem.mockResolvedValue({
          id: 'ar-002',
          status: ApArStatus.OPEN,
          originalAmount: new Prisma.Decimal('535.00'),
        } as any);

        await service.issueInvoice(joId, dto, userId);

        expect(arService.createArOpenItem).toHaveBeenCalledWith(
          expect.objectContaining({
            customerId,
            txType: TxType.SALE_INVOICE,
            originalAmount: 535,
            vatAmount: 35,
          }),
        );
      });
    });

    describe('Path A continuation: INVOICE_FROM_DO (has TEMP_DO)', () => {
      const joWithTempDo = {
        ...mockDoneJobOrder,
        hasTempDo: true,
        tempDoId: 'temp-do-tx-001',
      };

      it('should issue INVOICE_FROM_DO when hasTempDo=true', async () => {
        jobOrderRepository.findById.mockResolvedValue(joWithTempDo);
        jobOrderRepository.update.mockResolvedValue(joWithTempDo);

        const invoiceFromDoTx = {
          ...mockTxEntry,
          txType: TxType.INVOICE_FROM_DO,
          qty: 0,
          unitCost: 0,
          totalCost: 0,
          arAmount: 0,
          parentTxId: 'temp-do-tx-001',
        };
        txLogService.createTx.mockResolvedValue({ ...invoiceFromDoTx, status: TxStatus.DRAFT });
        txLogService.postTx.mockResolvedValue(invoiceFromDoTx);

        const result = await service.issueInvoice(joId, dto, userId);

        // INVOICE_FROM_DO should NOT create a new AR item
        expect(arService.createArOpenItem).not.toHaveBeenCalled();
        expect(result.arOpenItem.status).toBe('EXISTING');
      });

      it('should create TX with qty=0, cost=0, arAmount=0 for INVOICE_FROM_DO', async () => {
        jobOrderRepository.findById.mockResolvedValue(joWithTempDo);
        jobOrderRepository.update.mockResolvedValue(joWithTempDo);
        txLogService.postTx.mockResolvedValue({
          ...mockTxEntry,
          txType: TxType.INVOICE_FROM_DO,
          qty: 0,
          totalCost: 0,
          arAmount: 0,
        });

        await service.issueInvoice(joId, dto, userId);

        expect(txLogService.createTx).toHaveBeenCalledWith(
          expect.objectContaining({
            txType: TxType.INVOICE_FROM_DO,
            qty: 0,
            unitCost: 0,
            totalCost: 0,
            arAmount: 0,
            parentTxId: 'temp-do-tx-001',
          }),
        );
      });

      it('should NOT validate stock for INVOICE_FROM_DO', async () => {
        jobOrderRepository.findById.mockResolvedValue(joWithTempDo);
        jobOrderRepository.update.mockResolvedValue(joWithTempDo);
        txLogService.postTx.mockResolvedValue({
          ...mockTxEntry,
          txType: TxType.INVOICE_FROM_DO,
        });

        await service.issueInvoice(joId, dto, userId);

        expect(stockValidationService.validateStockAvailability).not.toHaveBeenCalled();
      });
    });

    it('should throw JoNotDoneException when JO is not DONE', async () => {
      const openJo = { ...mockDoneJobOrder, status: PrismaJOStatus.IN_PROGRESS };
      jobOrderRepository.findById.mockResolvedValue(openJo);

      await expect(service.issueInvoice(joId, dto, userId)).rejects.toThrow(
        JoNotDoneException,
      );
    });

    it('should throw DuplicateInvoiceException when JO already has invoice', async () => {
      const joWithInvoice = { ...mockDoneJobOrder, invoiceId: 'existing-invoice-tx' };
      jobOrderRepository.findById.mockResolvedValue(joWithInvoice);

      await expect(service.issueInvoice(joId, dto, userId)).rejects.toThrow(
        DuplicateInvoiceException,
      );
    });

    it('should update JO with invoiceId after issuing', async () => {
      jobOrderRepository.findById.mockResolvedValue(mockDoneJobOrder);
      jobOrderRepository.update.mockResolvedValue(mockDoneJobOrder);
      txLogService.postTx.mockResolvedValue({ ...mockTxEntry, txType: TxType.SALE_INVOICE });
      arService.createArOpenItem.mockResolvedValue({
        id: 'ar-002',
        status: ApArStatus.OPEN,
        originalAmount: new Prisma.Decimal('535.00'),
      } as any);

      await service.issueInvoice(joId, dto, userId);

      expect(jobOrderRepository.update).toHaveBeenCalledWith(joId, {
        invoiceId: 'tx-001',
      });
    });
  });
});
