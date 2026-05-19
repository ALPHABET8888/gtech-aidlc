import { MockPeriodService, PeriodLockedException } from './mock-period.service';
import { PeriodStatus } from '@autoflow/shared-types';

describe('MockPeriodService', () => {
  let service: MockPeriodService;

  beforeEach(() => {
    service = new MockPeriodService();
  });

  describe('validatePeriodOpen', () => {
    it('should return true for open period', async () => {
      const result = await service.validatePeriodOpen('2025-01');
      expect(result).toBe(true);
    });

    it('should throw PeriodLockedException for closed period', async () => {
      await service.closePeriod('2024-12', 'cfo-1');
      await expect(
        service.validatePeriodOpen('2024-12'),
      ).rejects.toThrow(PeriodLockedException);
    });
  });

  describe('getCurrentPeriod', () => {
    it('should return current period in YYYY-MM format', () => {
      const period = service.getCurrentPeriod();
      expect(period).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('closePeriod', () => {
    it('should close a period', async () => {
      const result = await service.closePeriod('2025-01', 'cfo-1');
      expect(result.status).toBe(PeriodStatus.CLOSED);
      expect(result.closedBy).toBe('cfo-1');
      expect(result.closedAt).toBeDefined();
    });
  });

  describe('getPeriodInfo', () => {
    it('should return OPEN for unclosed period', async () => {
      const info = await service.getPeriodInfo('2025-01');
      expect(info).not.toBeNull();
      expect(info!.status).toBe(PeriodStatus.OPEN);
    });

    it('should return CLOSED for closed period', async () => {
      await service.closePeriod('2024-12', 'cfo-1');
      const info = await service.getPeriodInfo('2024-12');
      expect(info).not.toBeNull();
      expect(info!.status).toBe(PeriodStatus.CLOSED);
    });
  });
});
