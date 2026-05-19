import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WriteOffService, UploadedFile, ApproveWriteOffContext } from './write-off.service';
import { WriteOffRepository } from '@autoflow/warehouse-data-access';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { WriteOffStatus } from '@prisma/client';
import { Role, TxType } from '@autoflow/shared-types';
import * as fs from 'fs';

jest.mock('fs');

describe('WriteOffService', () => {
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

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockWarehouseId = '22222222-2222-2222-2222-222222222222';
  const mockItemId = '33333333-3333-3333-3333-333333333333';
  const mockWriteOffId = '55555555-5555-5555-5555-555555555555';

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

  describe('requestWriteOff', () => {
    const createDto = {
      warehouseId: mockWarehouseId,
      itemId: mockItemId,
      qty: 10,
      reason: 'Damaged goods - water damage',
      salvageValue: 50,
    };

    const mockWriteOff = {
      id: mockWriteOffId,
      warehouseId: mockWarehouseId,
      itemId: mockItemId,
      qty: 10,
      unitCost: 50,
      totalLoss: 500,
      salvageValue: 50,
      reason: 'Damaged goods - water damage',
      status: WriteOffStatus.PENDING_APPROVAL,
      requestedBy: mockUserId,
      approvedBy: null,
      approvedAt: null,
      txId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      writeOffRepository.create.mockResolvedValue(mockWriteOff as any);
    });

    it('should create a write-off request with PENDING_APPROVAL status', async () => {
      const result = await service.requestWriteOff(createDto, mockUserId);

      expect(result).toBeDefined();
      expect(result.status).toBe(WriteOffStatus.PENDING_APPROVAL);
    });

    it('should validate stock is sufficient via StockValidationService', async () => {
      await service.requestWriteOff(createDto, mockUserId);

      expect(stockValidationService.validateStockAvailability).toHaveBeenCalledWith(
        mockItemId,
        mockWarehouseId,
        10,
      );
    });

    it('should capture current MA as unit_cost', async () => {
      await service.requestWriteOff(createDto, mockUserId);

      expect(maService.getCurrentMa).toHaveBeenCalledWith(mockItemId, mockWarehouseId);
      expect(writeOffRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ unitCost: 50 }),
      );
    });

    it('should calculate total_loss = qty × unit_cost', async () => {
      await service.requestWriteOff(createDto, mockUserId);

      expect(writeOffRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalLoss: 500 }),
      );
    });

    it('should handle salvage_value if provided', async () => {
      await service.requestWriteOff(createDto, mockUserId);

      expect(writeOffRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ salvageValue: 50 }),
      );
    });

    it('should default salvage_value to 0 if not provided', async () => {
      const dtoWithoutSalvage = {
        warehouseId: mockWarehouseId,
        itemId: mockItemId,
        qty: 10,
        reason: 'Expired goods',
      };

      await service.requestWriteOff(dtoWithoutSalvage, mockUserId);

      expect(writeOffRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ salvageValue: 0 }),
      );
    });

    it('should throw if stock is insufficient', async () => {
      stockValidationService.validateStockAvailability.mockRejectedValue(
        new BadRequestException('Insufficient stock'),
      );

      await expect(service.requestWriteOff(createDto, mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should pass correct parameters to repository create', async () => {
      await service.requestWriteOff(createDto, mockUserId);

      expect(writeOffRepository.create).toHaveBeenCalledWith({
        warehouseId: mockWarehouseId,
        itemId: mockItemId,
        qty: 10,
        unitCost: 50,
        totalLoss: 500,
        salvageValue: 50,
        reason: 'Damaged goods - water damage',
        requestedBy: mockUserId,
      });
    });
  });

  describe('uploadEvidence', () => {
    const mockFile: UploadedFile = {
      originalname: 'damage-photo.jpg',
      buffer: Buffer.from('fake-image-data'),
      size: 1024,
      mimetype: 'image/jpeg',
    };

    const mockWriteOff = {
      id: mockWriteOffId,
      warehouseId: mockWarehouseId,
      itemId: mockItemId,
      qty: 10,
      unitCost: 50,
      totalLoss: 500,
      salvageValue: 0,
      reason: 'Damaged goods',
      status: WriteOffStatus.PENDING_APPROVAL,
      requestedBy: mockUserId,
      approvedBy: null,
      approvedAt: null,
      txId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      evidence: [],
    };

    const mockEvidence = {
      id: '66666666-6666-6666-6666-666666666666',
      writeOffId: mockWriteOffId,
      fileName: 'damage-photo.jpg',
      filePath: expect.any(String),
      fileSize: 1024,
      mimeType: 'image/jpeg',
      uploadedBy: mockUserId,
      uploadedAt: new Date(),
    };

    beforeEach(() => {
      writeOffRepository.findById.mockResolvedValue(mockWriteOff as any);
      writeOffRepository.createEvidence.mockResolvedValue(mockEvidence as any);
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    });

    it('should save file and create evidence record', async () => {
      const result = await service.uploadEvidence(mockWriteOffId, mockFile, mockUserId);

      expect(result).toBeDefined();
      expect(result.fileName).toBe('damage-photo.jpg');
      expect(result.fileSize).toBe(1024);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should create upload directory if it does not exist', async () => {
      await service.uploadEvidence(mockWriteOffId, mockFile, mockUserId);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(mockWriteOffId),
        { recursive: true },
      );
    });

    it('should write file to disk', async () => {
      await service.uploadEvidence(mockWriteOffId, mockFile, mockUserId);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(mockWriteOffId),
        mockFile.buffer,
      );
    });

    it('should create evidence record with correct metadata', async () => {
      await service.uploadEvidence(mockWriteOffId, mockFile, mockUserId);

      expect(writeOffRepository.createEvidence).toHaveBeenCalledWith({
        writeOffId: mockWriteOffId,
        fileName: 'damage-photo.jpg',
        filePath: expect.any(String),
        fileSize: 1024,
        mimeType: 'image/jpeg',
        uploadedBy: mockUserId,
      });
    });

    it('should throw NotFoundException if write-off not found', async () => {
      writeOffRepository.findById.mockResolvedValue(null);

      await expect(
        service.uploadEvidence('nonexistent', mockFile, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if write-off is not in PENDING_APPROVAL status', async () => {
      writeOffRepository.findById.mockResolvedValue({
        ...mockWriteOff,
        status: WriteOffStatus.POSTED,
      } as any);

      await expect(
        service.uploadEvidence(mockWriteOffId, mockFile, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not recreate directory if it already exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.mkdirSync as jest.Mock).mockClear();

      await service.uploadEvidence(mockWriteOffId, mockFile, mockUserId);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('approveWriteOff', () => {
    const cfoContext: ApproveWriteOffContext = {
      userId: mockUserId,
      roles: [Role.CFO],
    };

    const mockWriteOff = {
      id: mockWriteOffId,
      warehouseId: mockWarehouseId,
      itemId: mockItemId,
      qty: 10,
      unitCost: 50,
      totalLoss: 500,
      salvageValue: 0,
      reason: 'Damaged goods',
      status: WriteOffStatus.PENDING_APPROVAL,
      requestedBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      approvedBy: null,
      approvedAt: null,
      txId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      evidence: [{ id: 'ev-1' }],
    };

    const mockTxEntry = {
      txId: 'tx-11111111-1111-1111-1111-111111111111',
      txType: TxType.ADJ_WRITEOFF,
      status: 'DRAFT',
    };

    beforeEach(() => {
      writeOffRepository.findById.mockResolvedValue(mockWriteOff as any);
      writeOffRepository.countEvidenceByWriteOffId.mockResolvedValue(1);
      writeOffRepository.updateStatus.mockResolvedValue({
        ...mockWriteOff,
        status: WriteOffStatus.POSTED,
        approvedBy: mockUserId,
        approvedAt: new Date(),
        txId: mockTxEntry.txId,
      } as any);
      txLogService.createTx.mockResolvedValue(mockTxEntry as any);
      txLogService.postTx.mockResolvedValue({ ...mockTxEntry, status: 'POSTED' } as any);
    });

    it('should approve write-off and set status to POSTED', async () => {
      const result = await service.approveWriteOff(mockWriteOffId, cfoContext);

      expect(result.status).toBe(WriteOffStatus.POSTED);
    });

    it('should validate user has CFO role', async () => {
      const nonCfoContext: ApproveWriteOffContext = {
        userId: mockUserId,
        roles: [Role.MANAGER],
      };

      await expect(
        service.approveWriteOff(mockWriteOffId, nonCfoContext),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for Supervisor role', async () => {
      const supervisorContext: ApproveWriteOffContext = {
        userId: mockUserId,
        roles: [Role.SUPERVISOR],
      };

      await expect(
        service.approveWriteOff(mockWriteOffId, supervisorContext),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if write-off not found', async () => {
      writeOffRepository.findById.mockResolvedValue(null);

      await expect(
        service.approveWriteOff('nonexistent', cfoContext),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if write-off is not in PENDING_APPROVAL status', async () => {
      writeOffRepository.findById.mockResolvedValue({
        ...mockWriteOff,
        status: WriteOffStatus.POSTED,
      } as any);

      await expect(
        service.approveWriteOff(mockWriteOffId, cfoContext),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no evidence exists', async () => {
      writeOffRepository.countEvidenceByWriteOffId.mockResolvedValue(0);

      await expect(
        service.approveWriteOff(mockWriteOffId, cfoContext),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate stock won\'t go negative', async () => {
      await service.approveWriteOff(mockWriteOffId, cfoContext);

      expect(stockValidationService.validateStockAvailability).toHaveBeenCalledWith(
        mockItemId,
        mockWarehouseId,
        10,
      );
    });

    it('should POST ADJ_WRITEOFF via TxLogService', async () => {
      await service.approveWriteOff(mockWriteOffId, cfoContext);

      expect(txLogService.createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          txType: TxType.ADJ_WRITEOFF,
          itemId: mockItemId,
          warehouseId: mockWarehouseId,
          qty: -10,
          unitCost: 50,
          totalCost: -500,
        }),
      );
    });

    it('should post the TX after creation', async () => {
      await service.approveWriteOff(mockWriteOffId, cfoContext);

      expect(txLogService.postTx).toHaveBeenCalledWith(
        mockTxEntry.txId,
        mockUserId,
      );
    });

    it('should update write-off status to POSTED with tx_id', async () => {
      await service.approveWriteOff(mockWriteOffId, cfoContext);

      expect(writeOffRepository.updateStatus).toHaveBeenCalledWith(
        mockWriteOffId,
        WriteOffStatus.POSTED,
        expect.objectContaining({
          approvedBy: mockUserId,
          approvedAt: expect.any(Date),
          txId: mockTxEntry.txId,
        }),
      );
    });

    it('should allow CFO with multiple roles to approve', async () => {
      const multiRoleContext: ApproveWriteOffContext = {
        userId: mockUserId,
        roles: [Role.MANAGER, Role.CFO],
      };

      const result = await service.approveWriteOff(mockWriteOffId, multiRoleContext);
      expect(result.status).toBe(WriteOffStatus.POSTED);
    });
  });

  describe('getWriteOff', () => {
    const mockWriteOff = {
      id: mockWriteOffId,
      warehouseId: mockWarehouseId,
      itemId: mockItemId,
      qty: 10,
      unitCost: 50,
      totalLoss: 500,
      salvageValue: 0,
      reason: 'Damaged goods',
      status: WriteOffStatus.PENDING_APPROVAL,
      requestedBy: mockUserId,
      approvedBy: null,
      approvedAt: null,
      txId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      evidence: [],
    };

    it('should return write-off with evidence', async () => {
      writeOffRepository.findById.mockResolvedValue(mockWriteOff as any);

      const result = await service.getWriteOff(mockWriteOffId);

      expect(result).toEqual(mockWriteOff);
      expect(writeOffRepository.findById).toHaveBeenCalledWith(mockWriteOffId);
    });

    it('should throw NotFoundException if write-off not found', async () => {
      writeOffRepository.findById.mockResolvedValue(null);

      await expect(service.getWriteOff('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listWriteOffs', () => {
    it('should return paginated write-off list', async () => {
      const mockResult = {
        data: [],
        total: 0,
      };
      writeOffRepository.findByWarehouseAndStatus.mockResolvedValue(mockResult);

      const result = await service.listWriteOffs({
        warehouseId: mockWarehouseId,
        page: 1,
        limit: 20,
      });

      expect(result).toEqual(mockResult);
      expect(writeOffRepository.findByWarehouseAndStatus).toHaveBeenCalledWith({
        warehouseId: mockWarehouseId,
        page: 1,
        limit: 20,
      });
    });
  });
});
