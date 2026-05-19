/**
 * Property-Based Tests for Write-Off Service
 *
 * Tests correctness property P8 from design.md:
 * P8: Write-off Requires Evidence — FOR ALL approved write-offs: evidence_count >= 1
 *
 * Uses fast-check for randomized input generation.
 */
import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WriteOffService, ApproveWriteOffContext } from '../lib/services/write-off.service';
import { WriteOffRepository } from '@autoflow/warehouse-data-access';
import { WAREHOUSE_DI_TOKENS } from '../lib/mocks/di-tokens';
import { WriteOffStatus } from '@prisma/client';
import { Role, TxType } from '@autoflow/shared-types';

describe('Write-Off — Property-Based Tests', () => {
  /**
   * **Validates: Requirements US-025 AC2**
   *
   * P8: Write-off Requires Evidence — FOR ALL approved write-offs:
   * evidence_count >= 1. No write-off can be approved without at least 1 evidence file.
   */
  describe('P8: Write-off Requires Evidence', () => {
    let service: WriteOffService;
    let writeOffRepository: jest.Mocked<WriteOffRepository>;
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
      writeOffRepository = {
        create: jest.fn(),
        findById: jest.fn(),
        findByWarehouseAndStatus: jest.fn(),
        updateStatus: jest.fn(),
        createEvidence: jest.fn(),
        findEvidenceByWriteOffId: jest.fn(),
        countEvidenceByWriteOffId: jest.fn(),
      } as unknown as jest.Mocked<WriteOffRepository>;

      stockValidationService = {
        getStockBalance: jest.fn(),
        validateStockAvailability: jest.fn().mockResolvedValue({
          valid: true,
          availableQty: 100,
          requestedQty: 10,
        }),
        isStockFrozen: jest.fn(),
      };

      maService = {
        getCurrentMa: jest.fn().mockResolvedValue(50),
        calculateMa: jest.fn(),
        calculateStockOut: jest.fn(),
      };

      txLogService = {
        createTx: jest.fn().mockResolvedValue({
          txId: 'tx-mock-id',
          txType: TxType.ADJ_WRITEOFF,
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
          WriteOffService,
          { provide: WriteOffRepository, useValue: writeOffRepository },
          { provide: WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE, useValue: stockValidationService },
          { provide: WAREHOUSE_DI_TOKENS.MA_SERVICE, useValue: maService },
          { provide: WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE, useValue: txLogService },
          { provide: WAREHOUSE_DI_TOKENS.PERIOD_SERVICE, useValue: periodService },
        ],
      }).compile();

      service = module.get<WriteOffService>(WriteOffService);
    });

    it('attempting to approve a write-off with 0 evidence always throws BadRequestException', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // writeOffId
          fc.uuid(), // warehouseId
          fc.uuid(), // itemId
          fc.integer({ min: 1, max: 10000 }), // qty
          fc.integer({ min: 1, max: 10000 }), // unitCost
          fc.uuid(), // userId (CFO)
          async (writeOffId, warehouseId, itemId, qty, unitCost, userId) => {
            // Given: a write-off in PENDING_APPROVAL status with 0 evidence
            const mockWriteOff = {
              id: writeOffId,
              warehouseId,
              itemId,
              qty,
              unitCost,
              totalLoss: qty * unitCost,
              salvageValue: 0,
              reason: 'Test write-off',
              status: WriteOffStatus.PENDING_APPROVAL,
              requestedBy: 'requester-id',
              approvedBy: null,
              approvedAt: null,
              txId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              evidence: [],
            };

            writeOffRepository.findById.mockResolvedValue(mockWriteOff as any);
            writeOffRepository.countEvidenceByWriteOffId.mockResolvedValue(0);

            const cfoContext: ApproveWriteOffContext = {
              userId,
              roles: [Role.CFO],
            };

            // When: CFO attempts to approve
            // Then: should always throw BadRequestException
            await expect(
              service.approveWriteOff(writeOffId, cfoContext),
            ).rejects.toThrow(BadRequestException);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('a write-off with at least 1 evidence can be approved by CFO when in PENDING_APPROVAL status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // writeOffId
          fc.uuid(), // warehouseId
          fc.uuid(), // itemId
          fc.integer({ min: 1, max: 10000 }), // qty
          fc.integer({ min: 1, max: 10000 }), // unitCost
          fc.uuid(), // userId (CFO)
          fc.integer({ min: 1, max: 20 }), // evidenceCount (at least 1)
          async (writeOffId, warehouseId, itemId, qty, unitCost, userId, evidenceCount) => {
            // Given: a write-off in PENDING_APPROVAL status with >= 1 evidence
            const mockWriteOff = {
              id: writeOffId,
              warehouseId,
              itemId,
              qty,
              unitCost,
              totalLoss: qty * unitCost,
              salvageValue: 0,
              reason: 'Test write-off',
              status: WriteOffStatus.PENDING_APPROVAL,
              requestedBy: 'requester-id',
              approvedBy: null,
              approvedAt: null,
              txId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              evidence: Array.from({ length: evidenceCount }, (_, i) => ({ id: `ev-${i}` })),
            };

            writeOffRepository.findById.mockResolvedValue(mockWriteOff as any);
            writeOffRepository.countEvidenceByWriteOffId.mockResolvedValue(evidenceCount);
            writeOffRepository.updateStatus.mockResolvedValue({
              ...mockWriteOff,
              status: WriteOffStatus.POSTED,
              approvedBy: userId,
              approvedAt: new Date(),
              txId: 'tx-mock-id',
            } as any);

            const cfoContext: ApproveWriteOffContext = {
              userId,
              roles: [Role.CFO],
            };

            // When: CFO approves
            // Then: should succeed (no exception thrown) and return POSTED status
            const result = await service.approveWriteOff(writeOffId, cfoContext);
            expect(result.status).toBe(WriteOffStatus.POSTED);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('for all approved write-offs, evidence_count is always >= 1', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // writeOffId
          fc.uuid(), // warehouseId
          fc.uuid(), // itemId
          fc.integer({ min: 1, max: 10000 }), // qty
          fc.integer({ min: 1, max: 10000 }), // unitCost
          fc.uuid(), // userId
          fc.integer({ min: 0, max: 10 }), // evidenceCount (0 to 10, testing the invariant)
          async (writeOffId, warehouseId, itemId, qty, unitCost, userId, evidenceCount) => {
            // Given: a write-off in PENDING_APPROVAL status
            const mockWriteOff = {
              id: writeOffId,
              warehouseId,
              itemId,
              qty,
              unitCost,
              totalLoss: qty * unitCost,
              salvageValue: 0,
              reason: 'Test write-off',
              status: WriteOffStatus.PENDING_APPROVAL,
              requestedBy: 'requester-id',
              approvedBy: null,
              approvedAt: null,
              txId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              evidence: Array.from({ length: evidenceCount }, (_, i) => ({ id: `ev-${i}` })),
            };

            writeOffRepository.findById.mockResolvedValue(mockWriteOff as any);
            writeOffRepository.countEvidenceByWriteOffId.mockResolvedValue(evidenceCount);
            writeOffRepository.updateStatus.mockResolvedValue({
              ...mockWriteOff,
              status: WriteOffStatus.POSTED,
              approvedBy: userId,
              approvedAt: new Date(),
              txId: 'tx-mock-id',
            } as any);

            const cfoContext: ApproveWriteOffContext = {
              userId,
              roles: [Role.CFO],
            };

            // Property: if approval succeeds, evidence_count must be >= 1
            // If evidence_count is 0, approval must fail
            if (evidenceCount === 0) {
              await expect(
                service.approveWriteOff(writeOffId, cfoContext),
              ).rejects.toThrow(BadRequestException);
            } else {
              const result = await service.approveWriteOff(writeOffId, cfoContext);
              expect(result.status).toBe(WriteOffStatus.POSTED);
              // Invariant: the evidence count used for approval was >= 1
              expect(evidenceCount).toBeGreaterThanOrEqual(1);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
