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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createTx(dto: any, userId?: string): Promise<any>;

  /**
   * Retrieve a TX by ID.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findById(txId: string): Promise<any | null>;

  /**
   * Retrieve TX entries with filters and pagination.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany?(filters: any, pagination?: any): Promise<any[]>;

  /**
   * Update TX status (DRAFT→POSTED or POSTED→VOIDED).
   * Enforces immutability — rejects invalid transitions.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateStatus?(txId: string, status: string): Promise<any>;

  /**
   * Post a transaction (transition DRAFT→POSTED).
   * Used by downstream units after createTx.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postTx(txId: string, userId: string): Promise<any>;
}
