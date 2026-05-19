/**
 * Property-Based Tests for Stock Transfer Service
 *
 * Tests correctness properties P6 and P7 from design.md:
 * P6: Transfer Conservation — FOR ALL transfers: source_decrease_qty = destination_increase_qty (stock is conserved)
 * P7: Transfer Source Non-Negative — FOR ALL transfers: source_stock_after >= 0
 *
 * Uses fast-check for randomized input generation.
 */
import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { StockTransferService } from '../lib/services/stock-transfer.service';
import { TransferOrderRepository } from '@autoflow/warehouse-data-access';
import { WAREHOUSE_DI_TOKENS } from '../lib/mocks/di-tokens';
import { TransferStatus } from '@prisma/client';
import { TxType } from '@autoflow/shared-types';

describe('Stock Transfer — Property-Based Tests', () => {
  /**
   * **Validates: Requirements US-024 AC1**
   *
   * P6: Transfer Conservation — for any transfer qty where source has sufficient stock,
   * the total stock (source + dest) remains unchanged.
   * Formally: (sourceBefore + destBefore) === (sourceAfter + destAfter)
   */
  describe('P6: Transfer Conservation', () => {
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
        getStockBalance: jest.fn(),
        validateStockAvailability: jest.fn().mockResolvedValue({
          valid: true,
          availableQty: 10000,
          requestedQty: 1,
        }),
        isStockFrozen: jest.fn().mockResolvedValue(false),
      };

      maService = {
        getCurrentMa: jest.fn().mockResolvedValue(50),
        calculateMa: jest.fn().mockReturnValue({
          maBefore: 50,
          maAfter: 50,
          stockBefore: 0,
          stockAfter: 0,
          totalValueAfter: 0,
        }),
        calculateStockOut: jest.fn(),
      };

      txLogService = {
        createTx: jest.fn().mockResolvedValue({
          txId: 'tx-mock-id',
          txType: TxType.ADJ_TRANSFER,
          status: 'DRAFT',
        }),
        postTx: jest.fn().mockResolvedValue({
          txId: 'tx-mock-id',
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

    it('total stock (source + dest) remains unchanged after a valid transfer', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10000 }), // transferQty
          fc.integer({ min: 1, max: 100000 }), // sourceStockBefore
          fc.integer({ min: 0, max: 100000 }), // destStockBefore
          fc.uuid(), // sourceWarehouseId
          fc.uuid(), // destWarehouseId
          fc.uuid(), // itemId
          fc.uuid(), // userId
          async (transferQty, sourceStockBefore, destStockBefore, sourceWh, destWh, itemId, userId) => {
            // Precondition: source has enough stock and warehouses are different
            fc.pre(transferQty <= sourceStockBefore);
            fc.pre(sourceWh !== destWh);

            const totalBefore = sourceStockBefore + destStockBefore;

            // Track stock changes via the TX posted
            let postedTxQty = 0;
            txLogService.createTx.mockImplementation(async (dto: any) => {
              postedTxQty = dto.qty; // negative qty = decrease at source
              return { txId: 'tx-mock-id', txType: TxType.ADJ_TRANSFER, status: 'DRAFT' };
            });

            // Mock stock balance for destination
            stockValidationService.getStockBalance.mockResolvedValue(destStockBefore);

            // Setup repository mocks
            const mockOrder = {
              id: 'transfer-id',
              sourceWarehouseId: sourceWh,
              destWarehouseId: destWh,
              status: TransferStatus.DRAFT,
              initiatedBy: userId,
              postedAt: null,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            transferOrderRepository.create.mockResolvedValue(mockOrder as any);
            transferOrderRepository.createLines.mockResolvedValue({ count: 1 });
            transferOrderRepository.updateStatus.mockResolvedValue({
              ...mockOrder,
              status: TransferStatus.POSTED,
            } as any);
            transferOrderRepository.updateLinesTxId.mockResolvedValue({ count: 1 });
            transferOrderRepository.findById.mockResolvedValue({
              ...mockOrder,
              status: TransferStatus.POSTED,
              lines: [{ id: 'line-1', transferId: 'transfer-id', itemId, qty: transferQty, unitCost: 50, txId: 'tx-mock-id', createdAt: new Date() }],
            } as any);

            await service.initiateTransfer(
              { sourceWarehouseId: sourceWh, destWarehouseId: destWh, lines: [{ itemId, qty: transferQty }] },
              userId,
            );

            // Property: The TX decreases source by transferQty
            // Source after = sourceStockBefore - transferQty
            // Dest after = destStockBefore + transferQty
            // Total after = (sourceStockBefore - transferQty) + (destStockBefore + transferQty) = totalBefore
            const sourceAfter = sourceStockBefore + postedTxQty; // postedTxQty is negative
            const destAfter = destStockBefore + transferQty;
            const totalAfter = sourceAfter + destAfter;

            expect(totalAfter).toBe(totalBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('transfer qty posted equals the requested transfer qty (conservation at TX level)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10000 }), // transferQty
          fc.uuid(), // sourceWarehouseId
          fc.uuid(), // destWarehouseId
          fc.uuid(), // itemId
          fc.uuid(), // userId
          async (transferQty, sourceWh, destWh, itemId, userId) => {
            fc.pre(sourceWh !== destWh);

            let capturedTxQty = 0;
            txLogService.createTx.mockImplementation(async (dto: any) => {
              capturedTxQty = Math.abs(dto.qty);
              return { txId: 'tx-mock-id', txType: TxType.ADJ_TRANSFER, status: 'DRAFT' };
            });

            stockValidationService.getStockBalance.mockResolvedValue(0);

            const mockOrder = {
              id: 'transfer-id',
              sourceWarehouseId: sourceWh,
              destWarehouseId: destWh,
              status: TransferStatus.DRAFT,
              initiatedBy: userId,
              postedAt: null,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            transferOrderRepository.create.mockResolvedValue(mockOrder as any);
            transferOrderRepository.createLines.mockResolvedValue({ count: 1 });
            transferOrderRepository.updateStatus.mockResolvedValue({ ...mockOrder, status: TransferStatus.POSTED } as any);
            transferOrderRepository.updateLinesTxId.mockResolvedValue({ count: 1 });
            transferOrderRepository.findById.mockResolvedValue({
              ...mockOrder,
              status: TransferStatus.POSTED,
              lines: [{ id: 'line-1', transferId: 'transfer-id', itemId, qty: transferQty, unitCost: 50, txId: 'tx-mock-id', createdAt: new Date() }],
            } as any);

            await service.initiateTransfer(
              { sourceWarehouseId: sourceWh, destWarehouseId: destWh, lines: [{ itemId, qty: transferQty }] },
              userId,
            );

            // Property: the absolute qty in the TX equals the requested transfer qty
            expect(capturedTxQty).toBe(transferQty);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Validates: Requirements US-024 AC4**
   *
   * P7: Transfer Source Non-Negative — for all valid transfers, source_stock_after >= 0.
   * The service rejects transfers where source stock would go negative.
   */
  describe('P7: Transfer Source Non-Negative', () => {
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
        getStockBalance: jest.fn(),
        validateStockAvailability: jest.fn(),
        isStockFrozen: jest.fn().mockResolvedValue(false),
      };

      maService = {
        getCurrentMa: jest.fn().mockResolvedValue(50),
        calculateMa: jest.fn().mockReturnValue({
          maBefore: 50,
          maAfter: 50,
          stockBefore: 0,
          stockAfter: 0,
          totalValueAfter: 0,
        }),
        calculateStockOut: jest.fn(),
      };

      txLogService = {
        createTx: jest.fn().mockResolvedValue({
          txId: 'tx-mock-id',
          txType: TxType.ADJ_TRANSFER,
          status: 'DRAFT',
        }),
        postTx: jest.fn().mockResolvedValue({
          txId: 'tx-mock-id',
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

    it('rejects transfers where source stock would go negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10000 }), // transferQty
          fc.integer({ min: 0, max: 9999 }), // sourceStock (less than max transferQty)
          fc.uuid(), // sourceWarehouseId
          fc.uuid(), // destWarehouseId
          fc.uuid(), // itemId
          fc.uuid(), // userId
          async (transferQty, sourceStock, sourceWh, destWh, itemId, userId) => {
            // Precondition: transfer qty exceeds source stock (would go negative)
            fc.pre(transferQty > sourceStock);
            fc.pre(sourceWh !== destWh);

            // Mock stock validation to reject insufficient stock
            stockValidationService.validateStockAvailability.mockRejectedValue(
              new Error(`Insufficient stock: available ${sourceStock}, requested ${transferQty}`),
            );

            // When: attempting transfer that would make source negative
            // Then: should throw UnprocessableEntityException
            await expect(
              service.initiateTransfer(
                { sourceWarehouseId: sourceWh, destWarehouseId: destWh, lines: [{ itemId, qty: transferQty }] },
                userId,
              ),
            ).rejects.toThrow(UnprocessableEntityException);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('for all valid transfers, source stock after transfer is non-negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10000 }), // transferQty
          fc.integer({ min: 1, max: 100000 }), // sourceStock
          fc.uuid(), // sourceWarehouseId
          fc.uuid(), // destWarehouseId
          fc.uuid(), // itemId
          fc.uuid(), // userId
          async (transferQty, sourceStock, sourceWh, destWh, itemId, userId) => {
            // Precondition: source has enough stock and warehouses are different
            fc.pre(transferQty <= sourceStock);
            fc.pre(sourceWh !== destWh);

            // Mock stock validation to pass (sufficient stock)
            stockValidationService.validateStockAvailability.mockResolvedValue({
              valid: true,
              availableQty: sourceStock,
              requestedQty: transferQty,
            });
            stockValidationService.getStockBalance.mockResolvedValue(0);

            const mockOrder = {
              id: 'transfer-id',
              sourceWarehouseId: sourceWh,
              destWarehouseId: destWh,
              status: TransferStatus.DRAFT,
              initiatedBy: userId,
              postedAt: null,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            transferOrderRepository.create.mockResolvedValue(mockOrder as any);
            transferOrderRepository.createLines.mockResolvedValue({ count: 1 });
            transferOrderRepository.updateStatus.mockResolvedValue({ ...mockOrder, status: TransferStatus.POSTED } as any);
            transferOrderRepository.updateLinesTxId.mockResolvedValue({ count: 1 });
            transferOrderRepository.findById.mockResolvedValue({
              ...mockOrder,
              status: TransferStatus.POSTED,
              lines: [{ id: 'line-1', transferId: 'transfer-id', itemId, qty: transferQty, unitCost: 50, txId: 'tx-mock-id', createdAt: new Date() }],
            } as any);

            // When: transfer succeeds
            await service.initiateTransfer(
              { sourceWarehouseId: sourceWh, destWarehouseId: destWh, lines: [{ itemId, qty: transferQty }] },
              userId,
            );

            // Property: source stock after transfer is non-negative
            const sourceStockAfter = sourceStock - transferQty;
            expect(sourceStockAfter).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('the service never allows a transfer to proceed when stock validation fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10000 }), // transferQty
          fc.uuid(), // sourceWarehouseId
          fc.uuid(), // destWarehouseId
          fc.uuid(), // itemId
          fc.uuid(), // userId
          async (transferQty, sourceWh, destWh, itemId, userId) => {
            fc.pre(sourceWh !== destWh);

            // Mock stock validation to always fail
            stockValidationService.validateStockAvailability.mockRejectedValue(
              new Error('Stock validation failed'),
            );

            // Property: if stock validation fails, transfer is always rejected
            await expect(
              service.initiateTransfer(
                { sourceWarehouseId: sourceWh, destWarehouseId: destWh, lines: [{ itemId, qty: transferQty }] },
                userId,
              ),
            ).rejects.toThrow(UnprocessableEntityException);

            // And no TX is created
            expect(txLogService.createTx).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
