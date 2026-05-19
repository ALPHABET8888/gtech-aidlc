import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { CountSessionRepository, CountSessionQueryParams } from '@autoflow/warehouse-data-access';
import {
  IStockValidationService,
  IMaCalculationService,
  ITxLogService,
  IPeriodService,
  TxType,
} from '@autoflow/shared-types';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { CreateCountSessionDto } from '../dto/create-count-session.dto';
import { RecordCountResultDto } from '../dto/record-count-result.dto';
import { CountSessionStatus } from '@prisma/client';

@Injectable()
export class StockCountService {
  constructor(
    private readonly countSessionRepository: CountSessionRepository,
    @Inject(WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE)
    private readonly stockValidationService: IStockValidationService,
    @Inject(WAREHOUSE_DI_TOKENS.MA_SERVICE)
    private readonly maService: IMaCalculationService,
    @Inject(WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE)
    private readonly txLogService: ITxLogService,
    @Inject(WAREHOUSE_DI_TOKENS.PERIOD_SERVICE)
    private readonly periodService: IPeriodService,
  ) {}

  /**
   * Initiate a stock count session.
   * - Creates a CountSession with INITIATED status
   * - Creates CountLines with is_frozen=true
   * - Captures system_qty and system_ma from MockStockValidationService/MockMaService
   * - Validates items are not already frozen
   * - Transitions to COUNTING status after creation
   */
  async initiateCount(dto: CreateCountSessionDto, initiatedBy: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item is required for stock count');
    }

    // Validate items are not already frozen in the same warehouse
    for (const item of dto.items) {
      const frozenLines = await this.countSessionRepository.findFrozenLinesByItem(item.itemId);

      if (frozenLines.length > 0) {
        for (const frozenLine of frozenLines) {
          const session = await this.countSessionRepository.findById(frozenLine.sessionId);
          if (session && session.warehouseId === dto.warehouseId) {
            throw new ConflictException(
              `Item ${item.itemId} is already frozen in warehouse ${dto.warehouseId} by session ${session.id}`,
            );
          }
        }
      }
    }

    // Create the count session
    const session = await this.countSessionRepository.create({
      warehouseId: dto.warehouseId,
      initiatedBy,
      notes: dto.notes,
    });

    // Create count lines with system_qty and system_ma captured at freeze time
    const lineInputs = await Promise.all(
      dto.items.map(async (item) => {
        const systemQty = await this.stockValidationService.getStockBalance(
          item.itemId,
          dto.warehouseId,
        );
        const systemMa = await this.maService.getCurrentMa(
          item.itemId,
          dto.warehouseId,
        );

        return {
          sessionId: session.id,
          itemId: item.itemId,
          systemQty,
          systemMa,
        };
      }),
    );

    await this.countSessionRepository.createLines(lineInputs);

    // Transition to COUNTING status
    await this.countSessionRepository.updateStatus(session.id, CountSessionStatus.COUNTING);

    // Return the session with lines
    const result = await this.countSessionRepository.findById(session.id);
    return result;
  }

  /**
   * Get a count session by ID with its lines.
   */
  async getSession(sessionId: string) {
    const session = await this.countSessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Count session ${sessionId} not found`);
    }
    return session;
  }

  /**
   * List count sessions with filters and pagination.
   */
  async listSessions(params: CountSessionQueryParams) {
    return this.countSessionRepository.findByWarehouseAndStatus(params);
  }

  /**
   * Record a physical count result for a specific line.
   * - Validates session is in COUNTING status
   * - Sets physical_qty and calculates difference (physical - system)
   * - Requires reason_code if difference != 0
   */
  async recordResult(sessionId: string, lineId: string, dto: RecordCountResultDto) {
    // Validate session exists and is in COUNTING status
    const session = await this.countSessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Count session ${sessionId} not found`);
    }
    if (session.status !== CountSessionStatus.COUNTING) {
      throw new ConflictException(
        `Count session ${sessionId} is not in COUNTING status (current: ${session.status})`,
      );
    }

    // Validate line exists and belongs to this session
    const line = await this.countSessionRepository.findLineById(lineId);
    if (!line) {
      throw new NotFoundException(`Count line ${lineId} not found`);
    }
    if (line.sessionId !== sessionId) {
      throw new BadRequestException(
        `Count line ${lineId} does not belong to session ${sessionId}`,
      );
    }

    // Calculate difference
    const difference = dto.physicalQty - Number(line.systemQty);

    // Require reason_code if difference != 0
    if (difference !== 0 && !dto.reasonCode) {
      throw new BadRequestException(
        'reason_code is required when physical_qty differs from system_qty',
      );
    }

    // Update the line with recorded results
    const updatedLine = await this.countSessionRepository.updateLine(lineId, {
      physicalQty: dto.physicalQty,
      difference,
      reasonCode: dto.reasonCode,
    });

    return updatedLine;
  }

  /**
   * Approve a count session and POST adjustments.
   * - Validates session exists and is in PENDING_APPROVAL status
   * - Transitions to APPROVED
   * - For each line with difference != 0:
   *   - If difference > 0 (physical > system): POST ADJ_COUNT_UP, recalculate MA
   *   - If difference < 0 (physical < system): POST ADJ_COUNT_DOWN, validate stock >= 0, MA unchanged
   * - Sets tx_id on each adjusted CountLine
   * - Unfreezes all lines (is_frozen = false)
   * - Transitions session to COMPLETED
   * - Sets completed_at, approved_by, approved_at timestamps
   */
  async approveCount(sessionId: string, userId: string) {
    // Validate session exists and is in PENDING_APPROVAL status
    const session = await this.countSessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Count session ${sessionId} not found`);
    }
    if (session.status !== CountSessionStatus.PENDING_APPROVAL) {
      throw new ConflictException(
        `Count session ${sessionId} is not in PENDING_APPROVAL status (current: ${session.status})`,
      );
    }

    const now = new Date();

    // Transition to APPROVED
    await this.countSessionRepository.updateStatus(sessionId, CountSessionStatus.APPROVED, {
      approvedBy: userId,
      approvedAt: now,
    });

    // Get current period for TX entries
    const currentPeriod = this.periodService.getCurrentPeriod();

    // Process each line with difference != 0
    const lines = await this.countSessionRepository.findLinesBySessionId(sessionId);
    const adjustments: Array<{ lineId: string; txType: TxType; txId: string }> = [];

    for (const line of lines) {
      const difference = Number(line.difference ?? 0);

      if (difference !== 0) {
        const systemQty = Number(line.systemQty);
        const systemMa = Number(line.systemMa);

        if (difference > 0) {
          // ADJ_COUNT_UP: physical > system — stock increase, recalculate MA
          const maResult = this.maService.calculateMa({
            currentQty: systemQty,
            currentMa: systemMa,
            qtyChange: difference,
            unitCost: systemMa, // Use current MA as unit cost for count-up
          });

          const txEntry = await this.txLogService.createTx({
            txType: TxType.ADJ_COUNT_UP,
            txDate: now.toISOString(),
            period: currentPeriod,
            itemId: line.itemId,
            warehouseId: session.warehouseId,
            qty: difference,
            unitCost: systemMa,
            totalCost: difference * systemMa,
            cogsUnit: null,
            vendorId: null,
            customerId: null,
            apAmount: 0,
            arAmount: 0,
            parentTxId: null,
            createdBy: userId,
            postedBy: userId,
          });

          // Post the TX
          await this.txLogService.postTx(txEntry.txId, userId);

          // Set tx_id on the line
          await this.countSessionRepository.updateLine(line.id, { txId: txEntry.txId });

          adjustments.push({
            lineId: line.id,
            txType: TxType.ADJ_COUNT_UP,
            txId: txEntry.txId,
          });
        } else {
          // ADJ_COUNT_DOWN: physical < system — stock decrease, validate stock >= 0, MA unchanged
          const decreaseQty = Math.abs(difference);

          // Validate stock won't go negative
          await this.stockValidationService.validateStockAvailability(
            line.itemId,
            session.warehouseId,
            decreaseQty,
          );

          const txEntry = await this.txLogService.createTx({
            txType: TxType.ADJ_COUNT_DOWN,
            txDate: now.toISOString(),
            period: currentPeriod,
            itemId: line.itemId,
            warehouseId: session.warehouseId,
            qty: -decreaseQty,
            unitCost: systemMa,
            totalCost: -(decreaseQty * systemMa),
            cogsUnit: null,
            vendorId: null,
            customerId: null,
            apAmount: 0,
            arAmount: 0,
            parentTxId: null,
            createdBy: userId,
            postedBy: userId,
          });

          // Post the TX
          await this.txLogService.postTx(txEntry.txId, userId);

          // Set tx_id on the line
          await this.countSessionRepository.updateLine(line.id, { txId: txEntry.txId });

          adjustments.push({
            lineId: line.id,
            txType: TxType.ADJ_COUNT_DOWN,
            txId: txEntry.txId,
          });
        }
      }

      // Unfreeze all lines (regardless of whether they had a difference)
      await this.countSessionRepository.updateLine(line.id, { isFrozen: false });
    }

    // Transition to COMPLETED
    await this.countSessionRepository.updateStatus(sessionId, CountSessionStatus.COMPLETED, {
      completedAt: now,
    });

    // Return the completed session with adjustments
    const completedSession = await this.countSessionRepository.findById(sessionId);
    return {
      ...completedSession,
      adjustments,
    };
  }

  /**
   * Submit a count session for approval.
   * - Validates session is in COUNTING status
   * - Validates all lines have physical_qty recorded
   * - Transitions to PENDING_APPROVAL status
   */
  async submitForApproval(sessionId: string) {
    // Validate session exists and is in COUNTING status
    const session = await this.countSessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Count session ${sessionId} not found`);
    }
    if (session.status !== CountSessionStatus.COUNTING) {
      throw new ConflictException(
        `Count session ${sessionId} is not in COUNTING status (current: ${session.status})`,
      );
    }

    // Validate all lines have physical_qty recorded
    const lines = await this.countSessionRepository.findLinesBySessionId(sessionId);
    const uncountedLines = lines.filter((line) => line.physicalQty === null);
    if (uncountedLines.length > 0) {
      throw new BadRequestException(
        `Cannot submit: ${uncountedLines.length} line(s) have not been counted yet`,
      );
    }

    // Transition to PENDING_APPROVAL
    await this.countSessionRepository.updateStatus(sessionId, CountSessionStatus.PENDING_APPROVAL);

    // Return updated session
    return this.countSessionRepository.findById(sessionId);
  }
}
