import { TxType } from '../enums/tx-type.enum';
import { TxStatus } from '../enums/tx-status.enum';

/**
 * TX Log entry representing an immutable transaction record.
 */
export interface TxLogEntry {
  txId: string;
  txType: TxType;
  txDate: string;
  period: string;
  status: TxStatus;
  itemId: string | null;
  warehouseId: string | null;
  qty: number;
  unitCost: number;
  totalCost: number;
  maBefore: number;
  maAfter: number;
  stockBefore: number;
  stockAfter: number;
  cogsUnit: number | null;
  vendorId: string | null;
  customerId: string | null;
  apAmount: number;
  arAmount: number;
  parentTxId: string | null;
  createdBy: string;
  postedBy: string | null;
}

/**
 * Service interface for TX Log operations.
 * All units that create transactions must go through this interface.
 */
export interface ITxLogService {
  /**
   * Create and POST a new transaction through the full validation pipeline.
   * Pipeline: Period check → Stock check → RefChain check → MA calculation → POST
   */
  createTx(dto: unknown, userId: string): Promise<unknown>;

  /**
   * Retrieve a TX by ID.
   */
  findById(txId: string): Promise<unknown | null>;

  /**
   * Retrieve TX entries with filters and pagination.
   */
  findMany?(filters: unknown, pagination?: unknown): Promise<unknown[]>;

  /**
   * Update TX status (DRAFT→POSTED or POSTED→VOIDED).
   * Enforces immutability — rejects invalid transitions.
   */
  updateStatus?(txId: string, status: string): Promise<unknown>;
}
