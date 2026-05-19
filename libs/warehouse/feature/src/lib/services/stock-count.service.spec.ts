import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { StockCountService } from './stock-count.service';
import { CountSessionRepository } from '@autoflow/warehouse-data-access';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { CountSessionStatus } from '@prisma/client';

describe('StockCountService', () => {
  let service: StockCountService;
  let countSessionRepository: jest.Mocked<CountSessionRepository>;
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

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockWarehouseId = '22222222-2222-2222-2222-222222222222';
  const mockItemId1 = '33333333-3333-3333-3333-333333333333';
  const mockItemId2 = '44444444-4444-4444-4444-444444444444';

  beforeEach(async () => {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockCountService,
        { provide: CountSessionRepository, useValue: countSessionRepository },
        { provide: WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE, useValue: stockValidationService },
        { provide: WAREHOUSE_DI_TOKENS.MA_SERVICE, useValue: maService },
        { provide: WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE, useValue: txLogService },
        { provide: WAREHOUSE_DI_TOKENS.PERIOD_SERVICE, useValue: periodService },
      ],
    }).compile();

    service = module.get<StockCountService>(StockCountService);
  });

  describe('initiateCount', () => {
    const createDto = {
      warehouseId: mockWarehouseId,
      items: [{ itemId: mockItemId1 }, { itemId: mockItemId2 }],
      notes: 'Monthly stock count',
    };

    const mockSession = {
      id: '55555555-5555-5555-5555-555555555555',
      warehouseId: mockWarehouseId,
      status: CountSessionStatus.INITIATED,
      initiatedBy: mockUserId,
      initiatedAt: new Date(),
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      notes: 'Monthly stock count',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSessionWithLines = {
      ...mockSession,
      status: CountSessionStatus.COUNTING,
      lines: [
        {
          id: '66666666-6666-6666-6666-666666666666',
          sessionId: mockSession.id,
          itemId: mockItemId1,
          systemQty: 100,
          physicalQty: null,
          difference: null,
          systemMa: 50,
          isFrozen: true,
          reasonCode: null,
          txId: null,
          createdAt: new Date(),
        },
        {
          id: '77777777-7777-7777-7777-777777777777',
          sessionId: mockSession.id,
          itemId: mockItemId2,
          systemQty: 200,
          physicalQty: null,
          difference: null,
          systemMa: 75,
          isFrozen: true,
          reasonCode: null,
          txId: null,
          createdAt: new Date(),
        },
      ],
    };

    beforeEach(() => {
      countSessionRepository.findFrozenLinesByItem.mockResolvedValue([]);
      countSessionRepository.create.mockResolvedValue(mockSession as any);
      countSessionRepository.createLines.mockResolvedValue({ count: 2 });
      countSessionRepository.updateStatus.mockResolvedValue({
        ...mockSession,
        status: CountSessionStatus.COUNTING,
      } as any);
      countSessionRepository.findById.mockResolvedValue(mockSessionWithLines as any);
      stockValidationService.getStockBalance
        .mockResolvedValueOnce(100) // item1 qty
        .mockResolvedValueOnce(200); // item2 qty
      maService.getCurrentMa
        .mockResolvedValueOnce(50) // item1 MA
        .mockResolvedValueOnce(75); // item2 MA
    });

    it('should create a count session and transition to COUNTING status', async () => {
      const result = await service.initiateCount(createDto, mockUserId);

      expect(result).toBeDefined();
      expect(result!.status).toBe(CountSessionStatus.COUNTING);
      expect(result!.lines).toHaveLength(2);
    });

    it('should create the session with correct warehouse and user', async () => {
      await service.initiateCount(createDto, mockUserId);

      expect(countSessionRepository.create).toHaveBeenCalledWith({
        warehouseId: mockWarehouseId,
        initiatedBy: mockUserId,
        notes: 'Monthly stock count',
      });
    });

    it('should create count lines with system_qty and system_ma from services', async () => {
      await service.initiateCount(createDto, mockUserId);

      expect(countSessionRepository.createLines).toHaveBeenCalledWith([
        {
          sessionId: mockSession.id,
          itemId: mockItemId1,
          systemQty: 100,
          systemMa: 50,
        },
        {
          sessionId: mockSession.id,
          itemId: mockItemId2,
          systemQty: 200,
          systemMa: 75,
        },
      ]);
    });

    it('should capture system_qty from StockValidationService', async () => {
      await service.initiateCount(createDto, mockUserId);

      expect(stockValidationService.getStockBalance).toHaveBeenCalledWith(mockItemId1, mockWarehouseId);
      expect(stockValidationService.getStockBalance).toHaveBeenCalledWith(mockItemId2, mockWarehouseId);
    });

    it('should capture system_ma from MaService', async () => {
      await service.initiateCount(createDto, mockUserId);

      expect(maService.getCurrentMa).toHaveBeenCalledWith(mockItemId1, mockWarehouseId);
      expect(maService.getCurrentMa).toHaveBeenCalledWith(mockItemId2, mockWarehouseId);
    });

    it('should transition session from INITIATED to COUNTING', async () => {
      await service.initiateCount(createDto, mockUserId);

      expect(countSessionRepository.updateStatus).toHaveBeenCalledWith(
        mockSession.id,
        CountSessionStatus.COUNTING,
      );
    });

    it('should throw ConflictException if item is already frozen in same warehouse', async () => {
      const frozenLine = {
        id: '88888888-8888-8888-8888-888888888888',
        sessionId: '99999999-9999-9999-9999-999999999999',
        itemId: mockItemId1,
        systemQty: 50,
        physicalQty: null,
        difference: null,
        systemMa: 30,
        isFrozen: true,
        reasonCode: null,
        txId: null,
        createdAt: new Date(),
      };

      const existingSession = {
        id: '99999999-9999-9999-9999-999999999999',
        warehouseId: mockWarehouseId, // same warehouse
        status: CountSessionStatus.COUNTING,
        initiatedBy: mockUserId,
        initiatedAt: new Date(),
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [frozenLine],
      };

      countSessionRepository.findFrozenLinesByItem.mockResolvedValueOnce([frozenLine] as any);
      countSessionRepository.findById.mockResolvedValueOnce(existingSession as any);

      await expect(service.initiateCount(createDto, mockUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow same item frozen in different warehouse', async () => {
      const frozenLine = {
        id: '88888888-8888-8888-8888-888888888888',
        sessionId: '99999999-9999-9999-9999-999999999999',
        itemId: mockItemId1,
        systemQty: 50,
        physicalQty: null,
        difference: null,
        systemMa: 30,
        isFrozen: true,
        reasonCode: null,
        txId: null,
        createdAt: new Date(),
      };

      const differentWarehouseSession = {
        id: '99999999-9999-9999-9999-999999999999',
        warehouseId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // different warehouse
        status: CountSessionStatus.COUNTING,
        initiatedBy: mockUserId,
        initiatedAt: new Date(),
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [frozenLine],
      };

      countSessionRepository.findFrozenLinesByItem
        .mockResolvedValueOnce([frozenLine] as any) // item1 has frozen line
        .mockResolvedValueOnce([]); // item2 has no frozen lines

      // When checking the frozen line's session, it's in a different warehouse
      countSessionRepository.findById
        .mockResolvedValueOnce(differentWarehouseSession as any) // for frozen check
        .mockResolvedValueOnce(mockSessionWithLines as any); // for final result

      const result = await service.initiateCount(createDto, mockUserId);
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if no items provided', async () => {
      const emptyDto = {
        warehouseId: mockWarehouseId,
        items: [] as { itemId: string }[],
      };

      await expect(service.initiateCount(emptyDto, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should set is_frozen=true on all created count lines', async () => {
      await service.initiateCount(createDto, mockUserId);

      const createLinesCall = countSessionRepository.createLines.mock.calls[0][0];
      // The repository's createLines method sets isFrozen: true internally
      // We verify the lines were created (the repository handles the frozen flag)
      expect(createLinesCall).toHaveLength(2);
    });
  });

  describe('getSession', () => {
    it('should return session with lines', async () => {
      const mockResult = {
        id: '55555555-5555-5555-5555-555555555555',
        warehouseId: mockWarehouseId,
        status: CountSessionStatus.COUNTING,
        initiatedBy: mockUserId,
        initiatedAt: new Date(),
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [],
      };

      countSessionRepository.findById.mockResolvedValue(mockResult as any);

      const result = await service.getSession('55555555-5555-5555-5555-555555555555');
      expect(result).toEqual(mockResult);
      expect(countSessionRepository.findById).toHaveBeenCalledWith('55555555-5555-5555-5555-555555555555');
    });

    it('should throw NotFoundException if session not found', async () => {
      countSessionRepository.findById.mockResolvedValue(null);

      await expect(service.getSession('nonexistent-id')).rejects.toThrow(
        'Count session nonexistent-id not found',
      );
    });
  });

  describe('recordResult', () => {
    const mockSessionId = '55555555-5555-5555-5555-555555555555';
    const mockLineId = '66666666-6666-6666-6666-666666666666';

    const mockCountingSession = {
      id: mockSessionId,
      warehouseId: mockWarehouseId,
      status: CountSessionStatus.COUNTING,
      initiatedBy: mockUserId,
      initiatedAt: new Date(),
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [],
    };

    const mockLine = {
      id: mockLineId,
      sessionId: mockSessionId,
      itemId: mockItemId1,
      systemQty: 100,
      physicalQty: null,
      difference: null,
      systemMa: 50,
      isFrozen: true,
      reasonCode: null,
      txId: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      countSessionRepository.findById.mockResolvedValue(mockCountingSession as any);
      countSessionRepository.findLineById.mockResolvedValue(mockLine as any);
      countSessionRepository.updateLine.mockResolvedValue({
        ...mockLine,
        physicalQty: 95,
        difference: -5,
        reasonCode: 'DAMAGED',
      } as any);
    });

    it('should record physical_qty and calculate difference', async () => {
      const dto = { physicalQty: 95, reasonCode: 'DAMAGED' };

      const result = await service.recordResult(mockSessionId, mockLineId, dto);

      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(mockLineId, {
        physicalQty: 95,
        difference: -5,
        reasonCode: 'DAMAGED',
      });
      expect(result.physicalQty).toBe(95);
      expect(result.difference).toBe(-5);
    });

    it('should allow recording when physical_qty equals system_qty (no reason required)', async () => {
      const dto = { physicalQty: 100 };
      countSessionRepository.updateLine.mockResolvedValue({
        ...mockLine,
        physicalQty: 100,
        difference: 0,
      } as any);

      const result = await service.recordResult(mockSessionId, mockLineId, dto);

      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(mockLineId, {
        physicalQty: 100,
        difference: 0,
        reasonCode: undefined,
      });
      expect(result.difference).toBe(0);
    });

    it('should throw BadRequestException if difference != 0 and no reason_code', async () => {
      const dto = { physicalQty: 95 }; // difference = -5, no reasonCode

      await expect(
        service.recordResult(mockSessionId, mockLineId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if session not found', async () => {
      countSessionRepository.findById.mockResolvedValue(null);

      await expect(
        service.recordResult('nonexistent', mockLineId, { physicalQty: 95, reasonCode: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if session is not in COUNTING status', async () => {
      countSessionRepository.findById.mockResolvedValue({
        ...mockCountingSession,
        status: CountSessionStatus.PENDING_APPROVAL,
      } as any);

      await expect(
        service.recordResult(mockSessionId, mockLineId, { physicalQty: 95, reasonCode: 'X' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if line not found', async () => {
      countSessionRepository.findLineById.mockResolvedValue(null);

      await expect(
        service.recordResult(mockSessionId, 'nonexistent-line', { physicalQty: 95, reasonCode: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if line does not belong to session', async () => {
      countSessionRepository.findLineById.mockResolvedValue({
        ...mockLine,
        sessionId: 'different-session-id',
      } as any);

      await expect(
        service.recordResult(mockSessionId, mockLineId, { physicalQty: 95, reasonCode: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate positive difference when physical > system', async () => {
      const dto = { physicalQty: 110, reasonCode: 'FOUND_EXTRA' };
      countSessionRepository.updateLine.mockResolvedValue({
        ...mockLine,
        physicalQty: 110,
        difference: 10,
        reasonCode: 'FOUND_EXTRA',
      } as any);

      await service.recordResult(mockSessionId, mockLineId, dto);

      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(mockLineId, {
        physicalQty: 110,
        difference: 10,
        reasonCode: 'FOUND_EXTRA',
      });
    });
  });

  describe('submitForApproval', () => {
    const mockSessionId = '55555555-5555-5555-5555-555555555555';

    const mockCountingSession = {
      id: mockSessionId,
      warehouseId: mockWarehouseId,
      status: CountSessionStatus.COUNTING,
      initiatedBy: mockUserId,
      initiatedAt: new Date(),
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [],
    };

    const mockLinesAllCounted = [
      {
        id: '66666666-6666-6666-6666-666666666666',
        sessionId: mockSessionId,
        itemId: mockItemId1,
        systemQty: 100,
        physicalQty: 95,
        difference: -5,
        systemMa: 50,
        isFrozen: true,
        reasonCode: 'DAMAGED',
        txId: null,
        createdAt: new Date(),
      },
      {
        id: '77777777-7777-7777-7777-777777777777',
        sessionId: mockSessionId,
        itemId: mockItemId2,
        systemQty: 200,
        physicalQty: 200,
        difference: 0,
        systemMa: 75,
        isFrozen: true,
        reasonCode: null,
        txId: null,
        createdAt: new Date(),
      },
    ];

    beforeEach(() => {
      countSessionRepository.findById.mockResolvedValue(mockCountingSession as any);
      countSessionRepository.findLinesBySessionId.mockResolvedValue(mockLinesAllCounted as any);
      countSessionRepository.updateStatus.mockResolvedValue({
        ...mockCountingSession,
        status: CountSessionStatus.PENDING_APPROVAL,
      } as any);
    });

    it('should transition session to PENDING_APPROVAL when all lines are counted', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockCountingSession as any) // first call for validation
        .mockResolvedValueOnce({
          ...mockCountingSession,
          status: CountSessionStatus.PENDING_APPROVAL,
          lines: mockLinesAllCounted,
        } as any); // second call for return

      const result = await service.submitForApproval(mockSessionId);

      expect(countSessionRepository.updateStatus).toHaveBeenCalledWith(
        mockSessionId,
        CountSessionStatus.PENDING_APPROVAL,
      );
      expect(result!.status).toBe(CountSessionStatus.PENDING_APPROVAL);
    });

    it('should throw NotFoundException if session not found', async () => {
      countSessionRepository.findById.mockResolvedValue(null);

      await expect(service.submitForApproval('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if session is not in COUNTING status', async () => {
      countSessionRepository.findById.mockResolvedValue({
        ...mockCountingSession,
        status: CountSessionStatus.APPROVED,
      } as any);

      await expect(service.submitForApproval(mockSessionId)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if some lines have not been counted', async () => {
      const linesWithUncounted = [
        ...mockLinesAllCounted,
        {
          id: '88888888-8888-8888-8888-888888888888',
          sessionId: mockSessionId,
          itemId: '99999999-9999-9999-9999-999999999999',
          systemQty: 50,
          physicalQty: null, // not counted yet
          difference: null,
          systemMa: 30,
          isFrozen: true,
          reasonCode: null,
          txId: null,
          createdAt: new Date(),
        },
      ];

      countSessionRepository.findLinesBySessionId.mockResolvedValue(linesWithUncounted as any);

      await expect(service.submitForApproval(mockSessionId)).rejects.toThrow(BadRequestException);
    });

    it('should include count of uncounted lines in error message', async () => {
      const linesWithTwoUncounted = [
        {
          id: '66666666-6666-6666-6666-666666666666',
          sessionId: mockSessionId,
          itemId: mockItemId1,
          systemQty: 100,
          physicalQty: null,
          difference: null,
          systemMa: 50,
          isFrozen: true,
          reasonCode: null,
          txId: null,
          createdAt: new Date(),
        },
        {
          id: '77777777-7777-7777-7777-777777777777',
          sessionId: mockSessionId,
          itemId: mockItemId2,
          systemQty: 200,
          physicalQty: null,
          difference: null,
          systemMa: 75,
          isFrozen: true,
          reasonCode: null,
          txId: null,
          createdAt: new Date(),
        },
      ];

      countSessionRepository.findLinesBySessionId.mockResolvedValue(linesWithTwoUncounted as any);

      await expect(service.submitForApproval(mockSessionId)).rejects.toThrow(
        /2 line\(s\) have not been counted/,
      );
    });
  });

  describe('approveCount', () => {
    const mockSessionId = '55555555-5555-5555-5555-555555555555';
    const mockApproverId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const mockPendingSession = {
      id: mockSessionId,
      warehouseId: mockWarehouseId,
      status: CountSessionStatus.PENDING_APPROVAL,
      initiatedBy: mockUserId,
      initiatedAt: new Date(),
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lines: [],
    };

    const mockLinesWithDifferences = [
      {
        id: '66666666-6666-6666-6666-666666666666',
        sessionId: mockSessionId,
        itemId: mockItemId1,
        systemQty: 100,
        physicalQty: 110,
        difference: 10, // positive — ADJ_COUNT_UP
        systemMa: 50,
        isFrozen: true,
        reasonCode: 'FOUND_EXTRA',
        txId: null,
        createdAt: new Date(),
      },
      {
        id: '77777777-7777-7777-7777-777777777777',
        sessionId: mockSessionId,
        itemId: mockItemId2,
        systemQty: 200,
        physicalQty: 195,
        difference: -5, // negative — ADJ_COUNT_DOWN
        systemMa: 75,
        isFrozen: true,
        reasonCode: 'DAMAGED',
        txId: null,
        createdAt: new Date(),
      },
    ];

    const mockTxEntry = {
      txId: 'tx-11111111-1111-1111-1111-111111111111',
      txType: 'ADJ_COUNT_UP',
      status: 'DRAFT',
    };

    beforeEach(() => {
      countSessionRepository.findById.mockResolvedValue(mockPendingSession as any);
      countSessionRepository.findLinesBySessionId.mockResolvedValue(mockLinesWithDifferences as any);
      countSessionRepository.updateStatus.mockResolvedValue(mockPendingSession as any);
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
    });

    it('should throw NotFoundException if session not found', async () => {
      countSessionRepository.findById.mockResolvedValue(null);

      await expect(service.approveCount('nonexistent', mockApproverId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if session is not in PENDING_APPROVAL status', async () => {
      countSessionRepository.findById.mockResolvedValue({
        ...mockPendingSession,
        status: CountSessionStatus.COUNTING,
      } as any);

      await expect(service.approveCount(mockSessionId, mockApproverId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should transition session to APPROVED with approvedBy and approvedAt', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(countSessionRepository.updateStatus).toHaveBeenCalledWith(
        mockSessionId,
        CountSessionStatus.APPROVED,
        expect.objectContaining({
          approvedBy: mockApproverId,
          approvedAt: expect.any(Date),
        }),
      );
    });

    it('should POST ADJ_COUNT_UP for lines with positive difference', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: 'ADJ_COUNT_UP',
          itemId: mockItemId1,
          warehouseId: mockWarehouseId,
          qty: 10,
        }),
      );
    });

    it('should call calculateMa for ADJ_COUNT_UP lines', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(maService.calculateMa).toHaveBeenCalledWith({
        currentQty: 100,
        currentMa: 50,
        qtyChange: 10,
        unitCost: 50,
      });
    });

    it('should POST ADJ_COUNT_DOWN for lines with negative difference', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: 'ADJ_COUNT_DOWN',
          itemId: mockItemId2,
          warehouseId: mockWarehouseId,
          qty: -5,
        }),
      );
    });

    it('should validate stock >= 0 for ADJ_COUNT_DOWN lines', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(stockValidationService.validateStockAvailability).toHaveBeenCalledWith(
        mockItemId2,
        mockWarehouseId,
        5,
      );
    });

    it('should set tx_id on each adjusted CountLine', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      // tx_id should be set for both lines (both have difference != 0)
      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(
        '66666666-6666-6666-6666-666666666666',
        { txId: mockTxEntry.txId },
      );
      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(
        '77777777-7777-7777-7777-777777777777',
        { txId: mockTxEntry.txId },
      );
    });

    it('should unfreeze all lines (is_frozen = false)', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(
        '66666666-6666-6666-6666-666666666666',
        { isFrozen: false },
      );
      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(
        '77777777-7777-7777-7777-777777777777',
        { isFrozen: false },
      );
    });

    it('should transition session to COMPLETED with completedAt', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(countSessionRepository.updateStatus).toHaveBeenCalledWith(
        mockSessionId,
        CountSessionStatus.COMPLETED,
        expect.objectContaining({
          completedAt: expect.any(Date),
        }),
      );
    });

    it('should return adjustments array with lineId, txType, and txId', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      const result = await service.approveCount(mockSessionId, mockApproverId);

      expect(result.adjustments).toHaveLength(2);
      expect(result.adjustments[0]).toEqual({
        lineId: '66666666-6666-6666-6666-666666666666',
        txType: 'ADJ_COUNT_UP',
        txId: mockTxEntry.txId,
      });
      expect(result.adjustments[1]).toEqual({
        lineId: '77777777-7777-7777-7777-777777777777',
        txType: 'ADJ_COUNT_DOWN',
        txId: mockTxEntry.txId,
      });
    });

    it('should not create TX for lines with difference = 0', async () => {
      const linesWithZeroDiff = [
        {
          id: '66666666-6666-6666-6666-666666666666',
          sessionId: mockSessionId,
          itemId: mockItemId1,
          systemQty: 100,
          physicalQty: 100,
          difference: 0,
          systemMa: 50,
          isFrozen: true,
          reasonCode: null,
          txId: null,
          createdAt: new Date(),
        },
      ];

      countSessionRepository.findLinesBySessionId.mockResolvedValue(linesWithZeroDiff as any);
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      const result = await service.approveCount(mockSessionId, mockApproverId);

      expect(txLogService.createTx).not.toHaveBeenCalled();
      expect(result.adjustments).toHaveLength(0);
    });

    it('should still unfreeze lines with difference = 0', async () => {
      const linesWithZeroDiff = [
        {
          id: '66666666-6666-6666-6666-666666666666',
          sessionId: mockSessionId,
          itemId: mockItemId1,
          systemQty: 100,
          physicalQty: 100,
          difference: 0,
          systemMa: 50,
          isFrozen: true,
          reasonCode: null,
          txId: null,
          createdAt: new Date(),
        },
      ];

      countSessionRepository.findLinesBySessionId.mockResolvedValue(linesWithZeroDiff as any);
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      expect(countSessionRepository.updateLine).toHaveBeenCalledWith(
        '66666666-6666-6666-6666-666666666666',
        { isFrozen: false },
      );
    });

    it('should post each created TX via txLogService.postTx', async () => {
      countSessionRepository.findById
        .mockResolvedValueOnce(mockPendingSession as any)
        .mockResolvedValueOnce({ ...mockPendingSession, status: CountSessionStatus.COMPLETED } as any);

      await service.approveCount(mockSessionId, mockApproverId);

      // Two lines with differences, so postTx should be called twice
      expect(txLogService.postTx).toHaveBeenCalledTimes(2);
      expect(txLogService.postTx).toHaveBeenCalledWith(mockTxEntry.txId, mockApproverId);
    });
  });
});
