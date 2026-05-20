import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PeriodService } from './period.service';
import { PeriodRepository } from '@autoflow/master-data-data-access';
import { PeriodLockedException } from '@autoflow/shared-errors';

describe('PeriodService', () => {
  let service: PeriodService;
  let periodRepository: jest.Mocked<PeriodRepository>;

  const mockPeriodOpen = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    period: '2025-01',
    status: 'OPEN',
    openedBy: 'user-001',
    openedAt: new Date('2025-01-01'),
    closedBy: null,
    closedAt: null,
  };

  const mockPeriodClosed = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    period: '2024-12',
    status: 'CLOSED',
    openedBy: 'user-001',
    openedAt: new Date('2024-12-01'),
    closedBy: 'user-002',
    closedAt: new Date('2025-01-05'),
  };

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

    service = module.get<PeriodService>(PeriodService);
    periodRepository = module.get(PeriodRepository);
  });

  describe('validatePeriodOpen', () => {
    it('should pass validation when period is OPEN', async () => {
      periodRepository.findByPeriod.mockResolvedValue(mockPeriodOpen);

      await expect(
        service.validatePeriodOpen('2025-01'),
      ).resolves.toBeUndefined();

      expect(periodRepository.findByPeriod).toHaveBeenCalledWith('2025-01');
    });

    it('should throw PeriodLockedException when period is CLOSED', async () => {
      periodRepository.findByPeriod.mockResolvedValue(mockPeriodClosed);

      await expect(service.validatePeriodOpen('2024-12')).rejects.toThrow(
        PeriodLockedException,
      );
    });

    it('should throw NotFoundException when period does not exist', async () => {
      periodRepository.findByPeriod.mockResolvedValue(null);

      await expect(service.validatePeriodOpen('2099-01')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listPeriods', () => {
    it('should return all periods', async () => {
      periodRepository.findAll.mockResolvedValue([
        mockPeriodOpen,
        mockPeriodClosed,
      ]);

      const result = await service.listPeriods();

      expect(result).toHaveLength(2);
      expect(periodRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('openPeriod', () => {
    it('should create a new period when it does not exist', async () => {
      periodRepository.findByPeriod.mockResolvedValue(null);
      periodRepository.create.mockResolvedValue({
        ...mockPeriodOpen,
        period: '2025-02',
      });

      const result = await service.openPeriod('2025-02', 'user-001');

      expect(result.period).toBe('2025-02');
      expect(periodRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          period: '2025-02',
          status: 'OPEN',
          openedBy: 'user-001',
        }),
      );
    });

    it('should throw ConflictException when period already exists', async () => {
      periodRepository.findByPeriod.mockResolvedValue(mockPeriodOpen);

      await expect(
        service.openPeriod('2025-01', 'user-001'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('closePeriod', () => {
    it('should close an open period', async () => {
      periodRepository.findById.mockResolvedValue(mockPeriodOpen);
      periodRepository.updateStatus.mockResolvedValue({
        ...mockPeriodOpen,
        status: 'CLOSED',
        closedBy: 'user-002',
        closedAt: new Date(),
      });

      const result = await service.closePeriod(mockPeriodOpen.id, 'user-002');

      expect(result.status).toBe('CLOSED');
      expect(periodRepository.updateStatus).toHaveBeenCalledWith(
        mockPeriodOpen.id,
        'CLOSED',
        'user-002',
        expect.any(Date),
      );
    });

    it('should throw NotFoundException when period does not exist', async () => {
      periodRepository.findById.mockResolvedValue(null);

      await expect(
        service.closePeriod('non-existent-id', 'user-002'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when period is already closed', async () => {
      periodRepository.findById.mockResolvedValue(mockPeriodClosed);

      await expect(
        service.closePeriod(mockPeriodClosed.id, 'user-002'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
