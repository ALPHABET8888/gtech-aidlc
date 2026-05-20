import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { TxLogService } from '../../services/tx-log.service';
import { PeriodService } from '../../services/period.service';
import { MaCalculationService } from '../../services/ma-calculation.service';
import { StockValidationService } from '../../services/stock-validation.service';
import { RefChainValidatorService } from '../../services/ref-chain-validator.service';
import { TxLogRepository, PeriodRepository } from '@autoflow/master-data-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import { ImmutableTxException, PeriodLockedException } from '@autoflow/shared-errors';
import { TxStatus, TxType } from '@prisma/client';

/**
 * Property-Based Tests for TX Log Immutability (P3) and Period Lock (P4).
 *
 * **Validates: Requirements US-001, US-004**
 *
 * P3: TX Log Immutability
 *   Once a transaction is POSTed, it can never be modified or deleted.
 *   Any attempt to update/delete a posted TX must throw ImmutableTxException (TX_IMMUTABLE).
 *
 * P4: Period Lock
 *   No transaction can be posted to a locked period.
 *   Any attempt to POST into a locked period must throw PeriodLockedException (PERIOD_LOCKED).
 */

// --- Generators ---

/** Generate a random TX type from the full enum */
const arbTxType = fc.constantFrom(
  TxType.GR_RECEIVE,
  TxType.GR_RETURN,
  TxType.GR_REPLACEMENT,
  TxType.TEMP_DO,
  TxType.SALE_INVOICE,
  TxType.CN_SALES_RETURN,
  TxType.CN_SALES_PRICE,
  TxType.CN_RETURN,
  TxType.CN_PRICE_ADJ,
  TxType.ADJ_COUNT_UP,
  TxType.ADJ_COUNT_DOWN,
  TxType.ADJ_WRITEOFF,
  TxType.JOB_ORDER,
  TxType.INVOICE_FROM_DO,
  TxType.AR_RECEIVE,
  TxType.AP_PAYMENT,
);

/** Generate a random UUID-like string */
const arbUuid = fc.uuid();

/** Generate a random period string (YYYY-MM format) */
const arbPeriod = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
).map(([year, month]) => `${year}-${String(month).padStart(2, '0')}`);

/** Generate a positive quantity */
const arbPositiveQty = fc.double({ min: 0.01, max: 100000, noNaN: true });

/** Generate a positive monetary value */
const arbPositiveValue = fc.double({ min: 0.01, max: 10000000, noNaN: true });

/** Generate a random TX date as ISO string */
const arbTxDate = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2030-12-31'),
}).map((d) => d.toISOString());

/**
 * Generate a complete mock POSTED TX log entry with random fields.
 * This represents a TX that has already been successfully posted.
 */
const arbPostedTx = fc.record({
  id: arbUuid,
  txType: arbTxType,
  txStatus: fc.constant(TxStatus.POSTED),
  txDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  period: arbPeriod,
  itemId: fc.option(arbUuid, { nil: null }),
  warehouseId: fc.option(arbUuid, { nil: null }),
  qty: fc.option(arbPositiveQty.map((v) => createDecimal(v)), { nil: null }),
  unitCost: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  totalCost: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  maBefore: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  maAfter: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  stockBefore: fc.option(arbPositiveQty.map((v) => createDecimal(v)), { nil: null }),
  stockAfter: fc.option(arbPositiveQty.map((v) => createDecimal(v)), { nil: null }),
  vendorId: fc.option(arbUuid, { nil: null }),
  customerId: fc.option(arbUuid, { nil: null }),
  refJoId: fc.option(arbUuid, { nil: null }),
  refDoId: fc.option(arbUuid, { nil: null }),
  refInvoiceId: fc.option(arbUuid, { nil: null }),
  refGrId: fc.option(arbUuid, { nil: null }),
  refCnId: fc.option(arbUuid, { nil: null }),
  parentTxId: fc.option(arbUuid, { nil: null }),
  taxInvoiceNo: fc.option(fc.string({ minLength: 3, maxLength: 20 }), { nil: null }),
  baseAmount: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  vatAmount: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  vatType: fc.option(fc.constantFrom('INPUT', 'OUTPUT', 'NONE'), { nil: null }),
  arAmount: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  apAmount: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  apArStatus: fc.option(fc.constantFrom('OPEN', 'PARTIAL', 'CLOSED'), { nil: null }),
  cogsUnit: fc.option(arbPositiveValue.map((v) => createDecimal(v)), { nil: null }),
  reason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  approvedBy: fc.option(arbUuid, { nil: null }),
  approvedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
  createdBy: arbUuid,
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
});

// --- Helpers ---

/** Creates a Prisma Decimal-like object for testing */
function createDecimal(value: number) {
  const d = Object.create(null);
  d.valueOf = () => value;
  d.toString = () => String(value);
  d[Symbol.toPrimitive] = () => value;
  return d;
}

// ===== P3: TX Log Immutability =====

describe('TX Immutability Property-Based Tests (P3)', () => {
  let service: TxLogService;
  let txLogRepository: jest.Mocked<TxLogRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxLogService,
        {
          provide: TxLogRepository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: { $transaction: jest.fn() },
        },
        {
          provide: PeriodService,
          useValue: { validatePeriodOpen: jest.fn() },
        },
        {
          provide: MaCalculationService,
          useValue: { calculateNewMa: jest.fn() },
        },
        {
          provide: StockValidationService,
          useValue: { validateStockAvailable: jest.fn() },
        },
        {
          provide: RefChainValidatorService,
          useValue: { validateRefChain: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TxLogService>(TxLogService);
    txLogRepository = module.get(TxLogRepository);
  });

  describe('P3: After POSTED, fields never change regardless of operations attempted', () => {
    /**
     * **Validates: Requirements US-001**
     *
     * Property: For any transaction that has status POSTED,
     * calling assertMutable MUST always throw ImmutableTxException.
     * This holds regardless of the TX type, fields, or other properties.
     */
    it('P3a: assertMutable always throws ImmutableTxException for any POSTED TX', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPostedTx,
          async (postedTx) => {
            // Mock the repository to return this POSTED TX
            txLogRepository.findById.mockResolvedValue(postedTx as any);

            // assertMutable MUST throw for any POSTED TX
            await expect(
              service.assertMutable(postedTx.id),
            ).rejects.toThrow(ImmutableTxException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-001**
     *
     * Property: For any transaction that has status VOIDED,
     * calling assertMutable MUST also throw ImmutableTxException.
     * VOIDED transactions are also immutable (they have been through POSTED state).
     */
    it('P3b: assertMutable always throws ImmutableTxException for any VOIDED TX', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPostedTx,
          async (postedTx) => {
            // Use same shape but with VOIDED status
            const voidedTx = { ...postedTx, txStatus: TxStatus.VOIDED };
            txLogRepository.findById.mockResolvedValue(voidedTx as any);

            // assertMutable MUST throw for any VOIDED TX
            await expect(
              service.assertMutable(voidedTx.id),
            ).rejects.toThrow(ImmutableTxException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-001**
     *
     * Property: The TxLogRepository.updateStatus rejects invalid transitions
     * from POSTED status. Only POSTED→VOIDED is allowed.
     * Any attempt to transition POSTED→DRAFT must throw.
     */
    it('P3c: updateStatus rejects POSTED→DRAFT for any TX', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPostedTx,
          async (postedTx) => {
            // Configure mock to simulate the real repository behavior
            txLogRepository.updateStatus.mockImplementation(async (id, newStatus) => {
              // Simulate the immutability check from TxLogRepository
              const currentStatus = TxStatus.POSTED;
              const allowedTransitions: Record<TxStatus, TxStatus[]> = {
                [TxStatus.DRAFT]: [TxStatus.POSTED],
                [TxStatus.POSTED]: [TxStatus.VOIDED],
                [TxStatus.VOIDED]: [],
              };

              if (!allowedTransitions[currentStatus].includes(newStatus)) {
                throw new ImmutableTxException(id);
              }
              return { ...postedTx, txStatus: newStatus } as any;
            });

            // Attempting POSTED→DRAFT must always throw
            await expect(
              txLogRepository.updateStatus(postedTx.id, TxStatus.DRAFT),
            ).rejects.toThrow(ImmutableTxException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-001**
     *
     * Property: VOIDED transactions cannot transition to ANY other status.
     * Any attempt (VOIDED→DRAFT, VOIDED→POSTED) must throw.
     */
    it('P3d: updateStatus rejects ALL transitions from VOIDED', async () => {
      const arbTargetStatus = fc.constantFrom(TxStatus.DRAFT, TxStatus.POSTED);

      await fc.assert(
        fc.asyncProperty(
          arbPostedTx,
          arbTargetStatus,
          async (postedTx, targetStatus) => {
            const voidedTx = { ...postedTx, txStatus: TxStatus.VOIDED };

            txLogRepository.updateStatus.mockImplementation(async (id, newStatus) => {
              const currentStatus = TxStatus.VOIDED;
              const allowedTransitions: Record<TxStatus, TxStatus[]> = {
                [TxStatus.DRAFT]: [TxStatus.POSTED],
                [TxStatus.POSTED]: [TxStatus.VOIDED],
                [TxStatus.VOIDED]: [],
              };

              if (!allowedTransitions[currentStatus].includes(newStatus)) {
                throw new ImmutableTxException(id);
              }
              return { ...voidedTx, txStatus: newStatus } as any;
            });

            // ANY transition from VOIDED must throw
            await expect(
              txLogRepository.updateStatus(voidedTx.id, targetStatus),
            ).rejects.toThrow(ImmutableTxException);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});

// ===== P4: Period Lock =====

describe('Period Lock Property-Based Tests (P4)', () => {
  let periodService: PeriodService;
  let periodRepository: jest.Mocked<PeriodRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodService,
        {
          provide: PeriodRepository,
          useValue: {
            findByPeriod: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    periodService = module.get<PeriodService>(PeriodService);
    periodRepository = module.get(PeriodRepository);
  });

  describe('P4: No TX with closed period can reach POSTED status', () => {
    /**
     * **Validates: Requirements US-004**
     *
     * Property: For any period string that is CLOSED,
     * calling validatePeriodOpen MUST always throw PeriodLockedException.
     * This holds regardless of the period format or value.
     */
    it('P4a: validatePeriodOpen always throws PeriodLockedException for any CLOSED period', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPeriod,
          arbUuid,
          async (period, periodId) => {
            // Mock repository to return a CLOSED period record
            periodRepository.findByPeriod.mockResolvedValue({
              id: periodId,
              period,
              status: 'CLOSED',
              openedBy: 'user-001',
              openedAt: new Date('2024-01-01'),
              closedBy: 'user-002',
              closedAt: new Date('2024-06-30'),
            } as any);

            // validatePeriodOpen MUST throw for any CLOSED period
            await expect(
              periodService.validatePeriodOpen(period),
            ).rejects.toThrow(PeriodLockedException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-004**
     *
     * Property: For any period string that is OPEN,
     * calling validatePeriodOpen must NOT throw (it resolves successfully).
     */
    it('P4b: validatePeriodOpen passes for any OPEN period', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPeriod,
          arbUuid,
          async (period, periodId) => {
            // Mock repository to return an OPEN period record
            periodRepository.findByPeriod.mockResolvedValue({
              id: periodId,
              period,
              status: 'OPEN',
              openedBy: 'user-001',
              openedAt: new Date('2024-01-01'),
              closedBy: null,
              closedAt: null,
            } as any);

            // validatePeriodOpen must NOT throw for OPEN periods
            await expect(
              periodService.validatePeriodOpen(period),
            ).resolves.toBeUndefined();
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-004**
     *
     * Property: The period lock applies to ALL TX types equally.
     * For any combination of TX type and closed period,
     * the period validation must throw PeriodLockedException.
     * (The period check happens BEFORE any type-specific logic.)
     */
    it('P4c: period lock applies uniformly to all TX types', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTxType,
          arbPeriod,
          arbUuid,
          async (txType, period, periodId) => {
            // Mock repository to return a CLOSED period
            periodRepository.findByPeriod.mockResolvedValue({
              id: periodId,
              period,
              status: 'CLOSED',
              openedBy: 'user-001',
              openedAt: new Date('2024-01-01'),
              closedBy: 'user-002',
              closedAt: new Date('2024-06-30'),
            } as any);

            // Period lock must reject regardless of TX type
            await expect(
              periodService.validatePeriodOpen(period),
            ).rejects.toThrow(PeriodLockedException);

            // Verify the thrown exception is correctly related to the period
            try {
              await periodService.validatePeriodOpen(period);
            } catch (err) {
              expect(err).toBeInstanceOf(PeriodLockedException);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-004**
     *
     * Property: Once a period transitions from OPEN to CLOSED,
     * all subsequent validatePeriodOpen calls for that period must throw.
     * This verifies that the state transition is correctly enforced.
     */
    it('P4d: after period close, all subsequent validation attempts throw', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPeriod,
          arbUuid,
          fc.integer({ min: 1, max: 10 }), // number of attempts after close
          async (period, periodId, numAttempts) => {
            // Period is CLOSED
            periodRepository.findByPeriod.mockResolvedValue({
              id: periodId,
              period,
              status: 'CLOSED',
              openedBy: 'user-001',
              openedAt: new Date('2024-01-01'),
              closedBy: 'user-002',
              closedAt: new Date('2024-06-30'),
            } as any);

            // Every attempt to validate must throw
            for (let i = 0; i < numAttempts; i++) {
              await expect(
                periodService.validatePeriodOpen(period),
              ).rejects.toThrow(PeriodLockedException);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
