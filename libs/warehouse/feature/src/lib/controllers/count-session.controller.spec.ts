/**
 * Integration tests for Stock Count API endpoints.
 * Tests the full API flow via Supertest: create → count → submit → approve
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { CountSessionController } from './count-session.controller';
import { StockCountService } from '../services/stock-count.service';
import { CountSessionRepository } from '@autoflow/warehouse-data-access';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { CountSessionStatus } from '@prisma/client';
import { JwtAuthGuard } from '@autoflow/shared-auth';
import { RolesGuard } from '@autoflow/shared-auth';

describe('CountSessionController (Integration)', () => {
  let app: INestApplication;
  let countSessionRepository: jest.Mocked<CountSessionRepository>;
  let stockValidationService: {
    getStockBalance: jest.Mock;
    validateStockAvailability: jest.Mock;
    isStockFrozen: jest.Mock;
    validateNotFrozen: jest.Mock;
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

  const mockUserId = '11111111-1111-4111-a111-111111111111';
  const mockWarehouseId = '22222222-2222-4222-a222-222222222222';
  const mockItemId1 = '33333333-3333-4333-a333-333333333333';
  const mockItemId2 = '44444444-4444-4444-a444-444444444444';
  const mockSessionId = '55555555-5555-4555-a555-555555555555';
  const mockLineId1 = '66666666-6666-4666-a666-666666666666';
  const mockLineId2 = '77777777-7777-4777-a777-777777777777';

  beforeAll(async () => {
    countSessionRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByWarehouseAndStatus: jest.fn(),
      updateStatus: jest.fn(),
      createLine: jest.fn(),
      createLines: jest.fn(),
      findLineById: jest.fn(),
      updateLine: jest.fn(),
      findFrozenLinesByItem: jest.fn(),
      findLinesBySessionId: jest.fn(),
    } as unknown as jest.Mocked<CountSessionRepository>;

    stockValidationService = {
      getStockBalance: jest.fn(),
      validateStockAvailability: jest.fn(),
      isStockFrozen: jest.fn(),
      validateNotFrozen: jest.fn(),
    };

    maService = {
      getCurrentMa: jest.fn(),
      calculateMa: jest.fn(),
      calculateStockOut: jest.fn(),
    };

    txLogService = {
      createTx: jest.fn(),
      postTx: jest.fn(),
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CountSessionController],
      providers: [
        StockCountService,
        { provide: CountSessionRepository, useValue: countSessionRepository },
        { provide: WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE, useValue: stockValidationService },
        { provide: WAREHOUSE_DI_TOKENS.MA_SERVICE, useValue: maService },
        { provide: WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE, useValue: txLogService },
        { provide: WAREHOUSE_DI_TOKENS.PERIOD_SERVICE, useValue: periodService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            userId: mockUserId,
            username: 'test-supervisor',
            displayName: 'Test Supervisor',
            roles: ['SUPERVISOR'],
            isActive: true,
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    periodService.getCurrentPeriod.mockReturnValue('2025-01');
  });

  describe('Full API Flow: create → count → submit → approve', () => {
    const mockSession = {
      id: mockSessionId,
      warehouseId: mockWarehouseId,
      status: CountSessionStatus.INITIATED,
      initiatedBy: mockUserId,
      initiatedAt: new Date('2025-01-15T10:00:00Z'),
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      notes: 'Integration test count',
      createdAt: new Date('2025-01-15T10:00:00Z'),
      updatedAt: new Date('2025-01-15T10:00:00Z'),
    };

    const mockLines = [
      {
        id: mockLineId1,
        sessionId: mockSessionId,
        itemId: mockItemId1,
        systemQty: 100,
        physicalQty: null,
        difference: null,
        systemMa: 50,
        isFrozen: true,
        reasonCode: null,
        txId: null,
        createdAt: new Date('2025-01-15T10:00:00Z'),
      },
      {
        id: mockLineId2,
        sessionId: mockSessionId,
        itemId: mockItemId2,
        systemQty: 200,
        physicalQty: null,
        difference: null,
        systemMa: 75,
        isFrozen: true,
        reasonCode: null,
        txId: null,
        createdAt: new Date('2025-01-15T10:00:00Z'),
      },
    ];

    it('POST /api/v1/warehouse/count-sessions — creates session', async () => {
      countSessionRepository.findFrozenLinesByItem.mockResolvedValue([]);
      countSessionRepository.create.mockResolvedValue(mockSession as any);
      countSessionRepository.createLines.mockResolvedValue({ count: 2 });
      countSessionRepository.updateStatus.mockResolvedValue({
        ...mockSession,
        status: CountSessionStatus.COUNTING,
      } as any);
      countSessionRepository.findById.mockResolvedValue({
        ...mockSession,
        status: CountSessionStatus.COUNTING,
        lines: mockLines,
      } as any);
      stockValidationService.getStockBalance
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(200);
      maService.getCurrentMa
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(75);

      const response = await request(app.getHttpServer())
        .post('/api/v1/warehouse/count-sessions')
        .send({
          warehouseId: mockWarehouseId,
          items: [{ itemId: mockItemId1 }, { itemId: mockItemId2 }],
          notes: 'Integration test count',
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(CountSessionStatus.COUNTING);
      expect(response.body.lines).toHaveLength(2);
    });

    it('GET /api/v1/warehouse/count-sessions — lists sessions', async () => {
      countSessionRepository.findByWarehouseAndStatus.mockResolvedValue({
        data: [{ ...mockSession, status: CountSessionStatus.COUNTING }],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/warehouse/count-sessions')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(1);
    });

    it('GET /api/v1/warehouse/count-sessions/:id — gets session detail', async () => {
      countSessionRepository.findById.mockResolvedValue({
        ...mockSession,
        status: CountSessionStatus.COUNTING,
        lines: mockLines,
      } as any);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/warehouse/count-sessions/${mockSessionId}`)
        .expect(200);

      expect(response.body.id).toBe(mockSessionId);
      expect(response.body.lines).toHaveLength(2);
    });

    it('PATCH /api/v1/warehouse/count-sessions/:id/lines/:lineId — records count', async () => {
      countSessionRepository.findById.mockResolvedValue({
        ...mockSession,
        status: CountSessionStatus.COUNTING,
        lines: mockLines,
      } as any);
      countSessionRepository.findLineById.mockResolvedValue(mockLines[0] as any);
      countSessionRepository.updateLine.mockResolvedValue({
        ...mockLines[0],
        physicalQty: 110,
        difference: 10,
        reasonCode: 'FOUND_EXTRA',
      } as any);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/warehouse/count-sessions/${mockSessionId}/lines/${mockLineId1}`)
        .send({ physicalQty: 110, reasonCode: 'FOUND_EXTRA' })
        .expect(200);

      expect(response.body.physicalQty).toBe(110);
      expect(response.body.difference).toBe(10);
    });

    it('POST /api/v1/warehouse/count-sessions/:id/submit — submits for approval', async () => {
      const countedLines = mockLines.map((line, i) => ({
        ...line,
        physicalQty: i === 0 ? 110 : 200,
        difference: i === 0 ? 10 : 0,
        reasonCode: i === 0 ? 'FOUND_EXTRA' : null,
      }));

      countSessionRepository.findById
        .mockResolvedValueOnce({
          ...mockSession,
          status: CountSessionStatus.COUNTING,
          lines: countedLines,
        } as any)
        .mockResolvedValueOnce({
          ...mockSession,
          status: CountSessionStatus.PENDING_APPROVAL,
          lines: countedLines,
        } as any);
      countSessionRepository.findLinesBySessionId.mockResolvedValue(countedLines as any);
      countSessionRepository.updateStatus.mockResolvedValue({
        ...mockSession,
        status: CountSessionStatus.PENDING_APPROVAL,
      } as any);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/warehouse/count-sessions/${mockSessionId}/submit`)
        .expect(200);

      expect(response.body.status).toBe(CountSessionStatus.PENDING_APPROVAL);
    });

    it('POST /api/v1/warehouse/count-sessions/:id/approve — approves and posts adjustments', async () => {
      const countedLines = [
        { ...mockLines[0], physicalQty: 110, difference: 10, reasonCode: 'FOUND_EXTRA' },
        { ...mockLines[1], physicalQty: 195, difference: -5, reasonCode: 'DAMAGED' },
      ];

      const mockTxEntry = {
        txId: 'tx-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        status: 'DRAFT',
      };

      countSessionRepository.findById
        .mockResolvedValueOnce({
          ...mockSession,
          status: CountSessionStatus.PENDING_APPROVAL,
          lines: countedLines,
        } as any)
        .mockResolvedValueOnce({
          ...mockSession,
          status: CountSessionStatus.COMPLETED,
          lines: countedLines,
        } as any);
      countSessionRepository.findLinesBySessionId.mockResolvedValue(countedLines as any);
      countSessionRepository.updateStatus.mockResolvedValue({} as any);
      countSessionRepository.updateLine.mockResolvedValue({} as any);
      txLogService.createTx.mockResolvedValue(mockTxEntry as any);
      txLogService.postTx.mockResolvedValue({ ...mockTxEntry, status: 'POSTED' } as any);
      maService.calculateMa.mockReturnValue({
        maBefore: 50,
        maAfter: 50,
        stockBefore: 100,
        stockAfter: 110,
        totalValueAfter: 5500,
      });
      stockValidationService.validateStockAvailability.mockResolvedValue({
        valid: true,
        availableQty: 200,
        requestedQty: 5,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/v1/warehouse/count-sessions/${mockSessionId}/approve`)
        .expect(200);

      expect(response.body.status).toBe(CountSessionStatus.COMPLETED);
      expect(response.body.adjustments).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('POST /api/v1/warehouse/count-sessions — returns 409 when items already frozen', async () => {
      const frozenLine = {
        id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        sessionId: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
        itemId: mockItemId1,
        isFrozen: true,
      };
      const existingSession = {
        id: 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
        warehouseId: mockWarehouseId,
        status: CountSessionStatus.COUNTING,
      };

      countSessionRepository.findFrozenLinesByItem.mockResolvedValueOnce([frozenLine] as any);
      countSessionRepository.findById.mockResolvedValueOnce(existingSession as any);

      const response = await request(app.getHttpServer())
        .post('/api/v1/warehouse/count-sessions')
        .send({
          warehouseId: mockWarehouseId,
          items: [{ itemId: mockItemId1 }],
        })
        .expect(409);

      expect(response.body.message).toContain('already frozen');
    });

    it('GET /api/v1/warehouse/count-sessions/:id — returns 404 for non-existent session', async () => {
      countSessionRepository.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get(`/api/v1/warehouse/count-sessions/${mockSessionId}`)
        .expect(404);
    });

    it('PATCH record count — returns 409 when session not in COUNTING status', async () => {
      countSessionRepository.findById.mockResolvedValue({
        id: mockSessionId,
        status: CountSessionStatus.PENDING_APPROVAL,
        lines: [],
      } as any);

      await request(app.getHttpServer())
        .patch(`/api/v1/warehouse/count-sessions/${mockSessionId}/lines/${mockLineId1}`)
        .send({ physicalQty: 100 })
        .expect(409);
    });

    it('POST submit — returns 400 when not all lines counted', async () => {
      const uncountedLines = [
        { id: mockLineId1, sessionId: mockSessionId, physicalQty: null },
      ];

      countSessionRepository.findById.mockResolvedValue({
        id: mockSessionId,
        status: CountSessionStatus.COUNTING,
        lines: uncountedLines,
      } as any);
      countSessionRepository.findLinesBySessionId.mockResolvedValue(uncountedLines as any);

      await request(app.getHttpServer())
        .post(`/api/v1/warehouse/count-sessions/${mockSessionId}/submit`)
        .expect(400);
    });

    it('POST approve — returns 409 when session not in PENDING_APPROVAL status', async () => {
      countSessionRepository.findById.mockResolvedValue({
        id: mockSessionId,
        status: CountSessionStatus.COUNTING,
        lines: [],
      } as any);

      await request(app.getHttpServer())
        .post(`/api/v1/warehouse/count-sessions/${mockSessionId}/approve`)
        .expect(409);
    });
  });
});
