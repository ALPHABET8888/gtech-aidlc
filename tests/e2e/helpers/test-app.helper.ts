import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionsModule } from '@autoflow/transactions-feature';
import { JwtAuthGuard, RolesGuard } from '@autoflow/shared-auth';
import { Role, AuthContext } from '@autoflow/shared-types';
import {
  JobOrderRepository,
  ApOpenItemRepository,
  ArOpenItemRepository,
  GrIrClearingRepository,
} from '@autoflow/transactions-data-access';
import { PrismaService } from '@autoflow/shared-prisma';
import { randomUUID } from 'crypto';

/**
 * Test user context for E2E tests.
 * Simulates an authenticated user with ADMIN role (full access).
 */
export const TEST_USER: AuthContext = {
  userId: 'e2e-user-001',
  username: 'e2e-admin',
  displayName: 'E2E Test Admin',
  roles: [Role.ADMIN],
  isActive: true,
};

/**
 * Creates in-memory stores and mock repositories for E2E testing.
 * This avoids needing a real database while testing the full HTTP flow.
 */
export function createInMemoryStores() {
  const jobOrderStore = new Map<string, any>();
  const apStore = new Map<string, any>();
  const arStore = new Map<string, any>();
  const clearingStore = new Map<string, any>();

  let joCounter = 0;
  let apCounter = 0;
  let arCounter = 0;
  let clearingCounter = 0;

  const mockJobOrderRepo = {
    create: jest.fn(async (data: any) => {
      joCounter++;
      const id = randomUUID();
      const jo = {
        id,
        ...data,
        joNumber: `JO-E2E-${String(joCounter).padStart(4, '0')}`,
        totalAmount: new Prisma.Decimal(data.totalAmount ?? 0),
        vatAmount: new Prisma.Decimal(data.vatAmount ?? 0),
        grandTotal: new Prisma.Decimal(data.grandTotal ?? 0),
        tempDoId: null,
        invoiceId: null,
        hasTempDo: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jobOrderStore.set(id, jo);
      return jo;
    }),
    findById: jest.fn(async (id: string) => jobOrderStore.get(id) ?? null),
    findMany: jest.fn(async () => ({
      data: [...jobOrderStore.values()],
      total: jobOrderStore.size,
    })),
    updateStatus: jest.fn(async (id: string, status: any) => {
      const jo = jobOrderStore.get(id);
      if (!jo) return null;
      jo.status = status;
      jo.updatedAt = new Date();
      return jo;
    }),
    update: jest.fn(async (id: string, data: any) => {
      const jo = jobOrderStore.get(id);
      if (!jo) return null;
      Object.assign(jo, data);
      jo.updatedAt = new Date();
      return jo;
    }),
    findByJoNumber: jest.fn(async () => null),
  };

  const mockApRepo = {
    create: jest.fn(async (data: any) => {
      apCounter++;
      const id = randomUUID();
      const item = {
        id,
        ...data,
        remainingAmount: data.remainingAmount ?? data.originalAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
        allocations: [],
      };
      apStore.set(id, item);
      return item;
    }),
    findById: jest.fn(async (id: string) => apStore.get(id) ?? null),
    findByTxId: jest.fn(async (txId: string) => {
      for (const item of apStore.values()) {
        if (item.txId === txId) return item;
      }
      return null;
    }),
    findMany: jest.fn(async (options: any = {}) => {
      let data = [...apStore.values()];
      if (options?.vendorId) data = data.filter((i) => i.vendorId === options.vendorId);
      if (options?.status) data = data.filter((i) => i.status === options.status);
      return { data, total: data.length };
    }),
    findOpenByVendor: jest.fn(async (vendorId: string) => {
      return [...apStore.values()].filter(
        (i) => i.vendorId === vendorId && i.status !== 'CLOSED',
      );
    }),
    update: jest.fn(async (id: string, data: any) => {
      const item = apStore.get(id);
      if (!item) return null;
      Object.assign(item, data);
      item.updatedAt = new Date();
      return item;
    }),
    updateRemainingAndStatus: jest.fn(async (id: string, remainingAmount: any, status: any) => {
      const item = apStore.get(id);
      if (!item) return null;
      item.remainingAmount = remainingAmount;
      item.status = status;
      item.updatedAt = new Date();
      return item;
    }),
  };

  const mockArRepo = {
    create: jest.fn(async (data: any) => {
      arCounter++;
      const id = randomUUID();
      const item = {
        id,
        ...data,
        remainingAmount: data.remainingAmount ?? data.originalAmount,
        createdAt: new Date(),
        updatedAt: new Date(),
        allocations: [],
      };
      arStore.set(id, item);
      return item;
    }),
    findById: jest.fn(async (id: string) => arStore.get(id) ?? null),
    findByTxId: jest.fn(async (txId: string) => {
      for (const item of arStore.values()) {
        if (item.txId === txId) return item;
      }
      return null;
    }),
    findMany: jest.fn(async (options: any = {}) => {
      let data = [...arStore.values()];
      if (options?.customerId) data = data.filter((i) => i.customerId === options.customerId);
      if (options?.status) data = data.filter((i) => i.status === options.status);
      return { data, total: data.length };
    }),
    findOpenByCustomer: jest.fn(async (customerId: string) => {
      return [...arStore.values()].filter(
        (i) => i.customerId === customerId && i.status !== 'CLOSED',
      );
    }),
    update: jest.fn(async (id: string, data: any) => {
      const item = arStore.get(id);
      if (!item) return null;
      Object.assign(item, data);
      item.updatedAt = new Date();
      return item;
    }),
    updateRemainingAndStatus: jest.fn(async (id: string, remainingAmount: any, status: any) => {
      const item = arStore.get(id);
      if (!item) return null;
      item.remainingAmount = remainingAmount;
      item.status = status;
      item.updatedAt = new Date();
      return item;
    }),
  };

  const mockClearingRepo = {
    create: jest.fn(async (data: any) => {
      clearingCounter++;
      const id = randomUUID();
      const record = {
        id,
        ...data,
        closedByTxId: null,
        closedByType: null,
        ppvAmount: null,
        createdAt: new Date(),
        closedAt: null,
      };
      clearingStore.set(id, record);
      return record;
    }),
    findById: jest.fn(async (id: string) => clearingStore.get(id) ?? null),
    findByGrReturnTxId: jest.fn(async (grReturnTxId: string) => {
      for (const record of clearingStore.values()) {
        if (record.grReturnTxId === grReturnTxId) return record;
      }
      return null;
    }),
    close: jest.fn(async (id: string, closedByTxId: string, closedByType: string, ppvAmount?: any) => {
      const record = clearingStore.get(id);
      if (!record) throw new Error(`Clearing ${id} not found`);
      const updated = {
        ...record,
        status: 'CLOSED',
        closedByTxId,
        closedByType,
        ppvAmount: ppvAmount ?? null,
        closedAt: new Date(),
      };
      clearingStore.set(id, updated);
      return updated;
    }),
    findMany: jest.fn(async () => ({
      data: [...clearingStore.values()],
      total: clearingStore.size,
    })),
    findOpenByVendor: jest.fn(async (vendorId: string) => {
      return [...clearingStore.values()].filter(
        (c) => c.vendorId === vendorId && c.status === 'OPEN',
      );
    }),
  };

  const mockPrismaService = {
    aPPaymentAllocation: { create: jest.fn(async () => ({ id: randomUUID() })) },
    aRPaymentAllocation: { create: jest.fn(async () => ({ id: randomUUID() })) },
  };

  return {
    stores: { jobOrderStore, apStore, arStore, clearingStore },
    repos: {
      jobOrderRepo: mockJobOrderRepo,
      apRepo: mockApRepo,
      arRepo: mockArRepo,
      clearingRepo: mockClearingRepo,
    },
    prismaService: mockPrismaService,
  };
}

/**
 * Creates a NestJS test application with mocked auth guards and in-memory repositories.
 * Returns the app instance ready for Supertest requests.
 */
export async function createTestApp() {
  const { stores, repos, prismaService } = createInMemoryStores();

  // Override guards to bypass JWT authentication in E2E tests
  const mockJwtGuard = {
    canActivate: (context: any) => {
      const request = context.switchToHttp().getRequest();
      request.user = TEST_USER;
      return true;
    },
  };

  const mockRolesGuard = {
    canActivate: () => true,
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [TransactionsModule],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(mockJwtGuard)
    .overrideGuard(RolesGuard)
    .useValue(mockRolesGuard)
    .overrideProvider(JobOrderRepository)
    .useValue(repos.jobOrderRepo)
    .overrideProvider(ApOpenItemRepository)
    .useValue(repos.apRepo)
    .overrideProvider(ArOpenItemRepository)
    .useValue(repos.arRepo)
    .overrideProvider(GrIrClearingRepository)
    .useValue(repos.clearingRepo)
    .overrideProvider(PrismaService)
    .useValue(prismaService)
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return { app, stores, repos, moduleRef };
}
