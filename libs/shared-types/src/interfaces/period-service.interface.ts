/**
 * Period status — determines whether transactions can be posted.
 */
export enum PeriodStatus {
  /** Open — transactions can be posted */
  OPEN = 'OPEN',
  /** Closed — no new transactions allowed */
  CLOSED = 'CLOSED',
}

/**
 * Period information.
 */
export interface PeriodInfo {
  /** Period identifier in YYYY-MM format */
  period: string;
  /** Current status of the period */
  status: PeriodStatus;
  /** When the period was closed (null if still open) */
  closedAt: string | null;
  /** Who closed the period (null if still open) */
  closedBy: string | null;
}

/**
 * Service interface for accounting period management.
 * Period Lock must be checked before every POST operation — no exceptions.
 */
export interface IPeriodService {
  /**
   * Validate that a period is open and can accept new postings.
   * Throws PeriodLockedException if the period is closed.
   *
   * @param period - Period string in YYYY-MM format
   * @throws PeriodLockedException if period is closed
   * @throws NotFoundException if period does not exist
   */
  validatePeriodOpen(period: string): Promise<void>;

  /**
   * List all periods.
   */
  getAll(): Promise<unknown[]>;

  /**
   * Open a new period.
   *
   * @param period - Period string in YYYY-MM format
   * @param openedBy - User ID opening the period
   */
  create(period: string, openedBy: string): Promise<unknown>;

  /**
   * Close an existing period — prevents any future postings.
   * Requires CFO role.
   *
   * @param id - Period ID
   * @param closedBy - User ID closing the period
   */
  close(id: string, closedBy: string): Promise<unknown>;
}
