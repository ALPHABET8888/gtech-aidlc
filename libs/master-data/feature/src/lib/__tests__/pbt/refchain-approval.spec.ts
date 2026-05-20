import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RefChainValidatorService, RefField } from '../../services/ref-chain-validator.service';
import { ApprovalService } from '../../services/approval.service';
import { TxLogRepository } from '@autoflow/master-data-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import { RefChainInvalidException, InsufficientRoleException, ImmutableTxException } from '@autoflow/shared-errors';
import { TxType, TxStatus } from '@prisma/client';
import { Role, AuthContext } from '@autoflow/shared-types';

/**
 * Property-Based Tests for Reference Chain (P6) and Approval (P7).
 *
 * **Validates: Requirements US-006, US-007**
 *
 * P6: Reference Chain Completeness — Every TX with non-null ref_* fields
 *     has a corresponding POSTED TX for that reference. Missing or non-POSTED
 *     references must be rejected with RefChainInvalidException.
 *
 * P7: Approval Authority — A TX requiring approval can only transition
 *     DRAFT → POSTED if approved_by has the required role. Insufficient roles
 *     must be rejected with InsufficientRoleException.
 */

// --- Generators ---

/** Generate a random UUID-like string */
const arbUuid = fc.uuid();

/** TX types that require refInvoiceId */
const TX_TYPES_REQUIRING_INVOICE_REF: TxType[] = [
  TxType.CN_RETURN,
  TxType.CN_PRICE_ADJ,
  TxType.CN_SALES_RETURN,
  TxType.CN_SALES_PRICE,
];

/** TX types that require refGrId */
const TX_TYPES_REQUIRING_GR_REF: TxType[] = [TxType.GR_RETURN];

/** TX types that require refDoId */
const TX_TYPES_REQUIRING_DO_REF: TxType[] = [TxType.INVOICE_FROM_DO];

/** All TX types that have reference chain rules */
const ALL_TX_TYPES_WITH_REF_RULES: TxType[] = [
  ...TX_TYPES_REQUIRING_INVOICE_REF,
  ...TX_TYPES_REQUIRING_GR_REF,
  ...TX_TYPES_REQUIRING_DO_REF,
];

/** TX types that do NOT have reference chain rules (no refs required) */
const TX_TYPES_WITHOUT_REF_RULES: TxType[] = [
  TxType.GR_RECEIVE,
  TxType.GR_REPLACEMENT,
  TxType.TEMP_DO,
  TxType.SALE_INVOICE,
  TxType.JOB_ORDER,
  TxType.AR_RECEIVE,
  TxType.AP_PAYMENT,
  TxType.ADJ_COUNT_UP,
  TxType.ADJ_COUNT_DOWN,
  TxType.ADJ_WRITEOFF,
  TxType.ADJ_TRANSFER,
];

/** Generate a TX type that has ref chain rules */
const arbTxTypeWithRefRules = fc.constantFrom(...ALL_TX_TYPES_WITH_REF_RULES);

/** Generate a TX type without ref chain rules */
const arbTxTypeWithoutRefRules = fc.constantFrom(...TX_TYPES_WITHOUT_REF_RULES);

/** Roles that CAN approve (Manager+) */
const APPROVAL_ROLES: Role[] = [Role.MANAGER, Role.CFO, Role.ADMIN];

/** Roles that CANNOT approve (below Manager) */
const NON_APPROVAL_ROLES: Role[] = [Role.CASHIER, Role.STORE, Role.SUPERVISOR];

/** Generate a role that has approval authority */
const arbApprovalRole = fc.constantFrom(...APPROVAL_ROLES);

/** Generate a role that does NOT have approval authority */
const arbNonApprovalRole = fc.constantFrom(...NON_APPROVAL_ROLES);

/** Generate an AuthContext with specific roles */
function arbAuthContext(roleArb: fc.Arbitrary<Role>): fc.Arbitrary<AuthContext> {
  return fc.record({
    userId: arbUuid,
    username: fc.string({ minLength: 3, maxLength: 20 }).filter((s) => /^[a-z]/.test(s)),
    displayName: fc.string({ minLength: 1, maxLength: 50 }),
    roles: fc.array(roleArb, { minLength: 1, maxLength: 3 }),
    isActive: fc.constant(true),
  });
}

// --- Helpers ---

/** Creates a Prisma Decimal-like object for testing */
function createDecimal(value: number | null) {
  if (value === null) return null;
  const d = Object.create(null);
  d.valueOf = () => value;
  d.toString = () => String(value);
  d[Symbol.toPrimitive] = () => value;
  return d;
}

/** Get the required ref field for a given TX type */
function getRequiredRefField(txType: TxType): RefField {
  if (TX_TYPES_REQUIRING_INVOICE_REF.includes(txType)) return 'refInvoiceId';
  if (TX_TYPES_REQUIRING_GR_REF.includes(txType)) return 'refGrId';
  if (TX_TYPES_REQUIRING_DO_REF.includes(txType)) return 'refDoId';
  throw new Error(`No ref rule registered for ${txType}`);
}

/** Create a mock TX log record */
function createMockTxLog(id: string, status: TxStatus, txType: TxType = TxType.GR_RECEIVE) {
  return {
    id,
    txType,
    txStatus: status,
    txDate: new Date('2025-01-15'),
    period: '2025-01',
    itemId: 'item-001',
    warehouseId: 'wh-001',
    qty: createDecimal(10),
    unitCost: createDecimal(100),
    totalCost: createDecimal(1000),
    maBefore: createDecimal(90),
    maAfter: createDecimal(95),
    stockBefore: createDecimal(50),
    stockAfter: createDecimal(60),
    vendorId: null,
    customerId: null,
    refJoId: null,
    refDoId: null,
    refInvoiceId: null,
    refGrId: null,
    refCnId: null,
    parentTxId: null,
    taxInvoiceNo: null,
    baseAmount: createDecimal(1000),
    vatAmount: createDecimal(70),
    vatType: 'INPUT',
    arAmount: null,
    apAmount: createDecimal(1070),
    apArStatus: 'OPEN',
    cogsUnit: null,
    reason: null,
    approvedBy: null,
    approvedAt: null,
    createdBy: 'user-001',
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
  };
}

// ===== P6: Reference Chain Completeness =====

describe('Reference Chain Property-Based Tests (P6)', () => {
  let service: RefChainValidatorService;
  let txLogRepository: jest.Mocked<TxLogRepository>;

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

  describe('P6: Every TX with non-null ref_* has a corresponding POSTED TX', () => {
    /**
     * **Validates: Requirements US-006**
     *
     * Property: For any TX type that requires a reference, providing a valid
     * reference to a POSTED TX must pass validation (no exception thrown).
     */
    it('P6a: valid POSTED reference passes validation for any ref-requiring TX type', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTxTypeWithRefRules,
          arbUuid,
          async (txType, refTxId) => {
            const requiredField = getRequiredRefField(txType);

            // Mock: the referenced TX exists and is POSTED
            txLogRepository.findById.mockResolvedValue(
              createMockTxLog(refTxId, TxStatus.POSTED) as any,
            );

            // Validation should pass without throwing
            const refFields: Partial<Record<RefField, string | null>> = {
              [requiredField]: refTxId,
            };

            await expect(
              service.validateRefChain(txType, refFields),
            ).resolves.toBeUndefined();
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-006**
     *
     * Property: For any TX type that requires a reference, providing a null/missing
     * reference must always throw RefChainInvalidException.
     */
    it('P6b: missing reference (null) always throws RefChainInvalidException', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTxTypeWithRefRules,
          async (txType) => {
            const requiredField = getRequiredRefField(txType);

            // Provide null for the required field
            const refFields: Partial<Record<RefField, string | null>> = {
              [requiredField]: null,
            };

            await expect(
              service.validateRefChain(txType, refFields),
            ).rejects.toThrow(RefChainInvalidException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-006**
     *
     * Property: For any TX type that requires a reference, providing a reference
     * to a non-existent TX (not found in repository) must throw RefChainInvalidException.
     */
    it('P6c: reference to non-existent TX always throws RefChainInvalidException', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTxTypeWithRefRules,
          arbUuid,
          async (txType, refTxId) => {
            const requiredField = getRequiredRefField(txType);

            // Mock: referenced TX does not exist
            txLogRepository.findById.mockResolvedValue(null);

            const refFields: Partial<Record<RefField, string | null>> = {
              [requiredField]: refTxId,
            };

            await expect(
              service.validateRefChain(txType, refFields),
            ).rejects.toThrow(RefChainInvalidException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-006**
     *
     * Property: For any TX type that requires a reference, providing a reference
     * to a TX that exists but is NOT in POSTED status (DRAFT or VOIDED) must
     * throw RefChainInvalidException.
     */
    it('P6d: reference to non-POSTED TX (DRAFT or VOIDED) always throws RefChainInvalidException', async () => {
      const arbNonPostedStatus = fc.constantFrom(TxStatus.DRAFT, TxStatus.VOIDED);

      await fc.assert(
        fc.asyncProperty(
          arbTxTypeWithRefRules,
          arbUuid,
          arbNonPostedStatus,
          async (txType, refTxId, invalidStatus) => {
            const requiredField = getRequiredRefField(txType);

            // Mock: referenced TX exists but is NOT POSTED
            txLogRepository.findById.mockResolvedValue(
              createMockTxLog(refTxId, invalidStatus) as any,
            );

            const refFields: Partial<Record<RefField, string | null>> = {
              [requiredField]: refTxId,
            };

            await expect(
              service.validateRefChain(txType, refFields),
            ).rejects.toThrow(RefChainInvalidException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-006**
     *
     * Property: TX types that do NOT have reference chain rules should
     * pass validation regardless of what ref fields are provided (even empty).
     */
    it('P6e: TX types without ref rules always pass validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbTxTypeWithoutRefRules,
          async (txType) => {
            // Provide empty ref fields — should pass since no rules
            const refFields: Partial<Record<RefField, string | null>> = {};

            await expect(
              service.validateRefChain(txType, refFields),
            ).resolves.toBeUndefined();
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});

// ===== P7: Approval Authority =====

describe('Approval Authority Property-Based Tests (P7)', () => {
  let service: ApprovalService;
  let txLogRepository: jest.Mocked<TxLogRepository>;
  let prismaService: any;

  beforeEach(async () => {
    prismaService = {
      txLog: {
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
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
          useValue: prismaService,
        },
      ],
    }).compile();

    service = module.get<ApprovalService>(ApprovalService);
    txLogRepository = module.get(TxLogRepository);
  });

  describe('P7: DRAFT → POSTED only if approved_by has required role', () => {
    /**
     * **Validates: Requirements US-007**
     *
     * Property: For any user with an approval-level role (Manager, CFO, Admin)
     * and any TX in DRAFT status, the approval must succeed — transitioning
     * the TX to POSTED with approved_by and approved_at set.
     */
    it('P7a: user with approval role can always approve any DRAFT TX', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAuthContext(arbApprovalRole),
          arbUuid,
          async (user, txId) => {
            // Mock: TX exists and is in DRAFT status
            const draftTx = createMockTxLog(txId, TxStatus.DRAFT);
            txLogRepository.findById.mockResolvedValue(draftTx as any);

            // Mock: Prisma update returns the approved TX
            const approvedTx = {
              ...draftTx,
              txStatus: TxStatus.POSTED,
              approvedBy: user.userId,
              approvedAt: expect.any(Date),
            };
            prismaService.txLog.update.mockResolvedValue(approvedTx);

            // Approval must succeed
            const result = await service.approveTx(txId, user);
            expect(result.txStatus).toBe(TxStatus.POSTED);
            expect(result.approvedBy).toBe(user.userId);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-007**
     *
     * Property: For any user WITHOUT an approval-level role (Cashier, Store, Supervisor)
     * attempting to approve any TX, the approval must always be rejected with
     * InsufficientRoleException — regardless of TX state.
     */
    it('P7b: user without approval role is always rejected with InsufficientRoleException', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAuthContext(arbNonApprovalRole),
          arbUuid,
          async (user, txId) => {
            // Note: The role check happens BEFORE the TX lookup,
            // so we don't even need to mock the repository for this test.
            // But let's provide a DRAFT TX anyway for completeness.
            const draftTx = createMockTxLog(txId, TxStatus.DRAFT);
            txLogRepository.findById.mockResolvedValue(draftTx as any);

            // Approval must be rejected
            await expect(
              service.approveTx(txId, user),
            ).rejects.toThrow(InsufficientRoleException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-007**
     *
     * Property: Even a user with an approval-level role cannot approve a TX
     * that is already POSTED. The system must throw ImmutableTxException.
     */
    it('P7c: approval of already-POSTED TX throws ImmutableTxException regardless of role', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAuthContext(arbApprovalRole),
          arbUuid,
          async (user, txId) => {
            // Mock: TX exists but is already POSTED
            const postedTx = createMockTxLog(txId, TxStatus.POSTED);
            txLogRepository.findById.mockResolvedValue(postedTx as any);

            // Approval must be rejected (TX is not in DRAFT)
            await expect(
              service.approveTx(txId, user),
            ).rejects.toThrow(ImmutableTxException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-007**
     *
     * Property: Even a user with an approval-level role cannot approve a TX
     * that is VOIDED. The system must throw ImmutableTxException.
     */
    it('P7d: approval of VOIDED TX throws ImmutableTxException regardless of role', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAuthContext(arbApprovalRole),
          arbUuid,
          async (user, txId) => {
            // Mock: TX exists but is VOIDED
            const voidedTx = createMockTxLog(txId, TxStatus.VOIDED);
            txLogRepository.findById.mockResolvedValue(voidedTx as any);

            // Approval must be rejected
            await expect(
              service.approveTx(txId, user),
            ).rejects.toThrow(ImmutableTxException);
          },
        ),
        { numRuns: 200 },
      );
    });

    /**
     * **Validates: Requirements US-007**
     *
     * Property: Approving a non-existent TX (not found) must throw NotFoundException
     * for any user with approval authority.
     */
    it('P7e: approval of non-existent TX throws NotFoundException', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAuthContext(arbApprovalRole),
          arbUuid,
          async (user, txId) => {
            // Mock: TX does not exist
            txLogRepository.findById.mockResolvedValue(null);

            // Must throw NotFoundException
            await expect(
              service.approveTx(txId, user),
            ).rejects.toThrow(NotFoundException);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
