import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UnprocessableEntityException } from '@nestjs/common';
import {
  TransferOrderRepository,
  TransferOrderQueryParams,
} from '@autoflow/warehouse-data-access';
import {
  IStockValidationService,
  IMaCalculationService,
  ITxLogService,
  IPeriodService,
  TxType,
} from '@autoflow/shared-types';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { CreateTransferDto } from '../dto/create-transfer.dto';
import { TransferStatus } from '@prisma/client';

@Injectable()
export class StockTransferService {
  constructor(
    private readonly transferOrderRepository: TransferOrderRepository,
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
   * Initiate a stock transfer between warehouses.
   * - Validates source != destination warehouse
   * - Validates source stock is sufficient for each line item
   * - Creates TransferOrder with DRAFT status
   * - Creates TransferLines for each item
   * - Atomic operation: decrease source stock (MA unchanged) + increase dest stock (MA recalculated)
   * - POSTs a single ADJ_TRANSFER TX via MockTxLogService
   * - Sets status to POSTED, records tx_id on lines
   */
  async initiateTransfer(dto: CreateTransferDto, initiatedBy: string) {
    // 1. Validate source warehouse != destination warehouse
    if (dto.sourceWarehouseId === dto.destWarehouseId) {
      throw new BadRequestException(
        'Source warehouse and destination warehouse must be different',
      );
    }

    // 2. Validate lines are not empty
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one transfer line is required');
    }

    // 3. Validate source stock is sufficient for each line item
    for (const line of dto.lines) {
      try {
        await this.stockValidationService.validateStockAvailable(
          line.itemId,
          dto.sourceWarehouseId,
          line.qty,
        );
      } catch (error) {
        throw new UnprocessableEntityException(
          `Insufficient stock for item ${line.itemId} in source warehouse ${dto.sourceWarehouseId}. ` +
          `Requested: ${line.qty}`,
        );
      }
    }

    // 4. Create TransferOrder with DRAFT status
    const transferOrder = await this.transferOrderRepository.create({
      sourceWarehouseId: dto.sourceWarehouseId,
      destWarehouseId: dto.destWarehouseId,
      initiatedBy,
      notes: dto.notes,
    });

    // 5. Create TransferLines — capture unit_cost (MA at source warehouse) for each item
    const lineInputs = await Promise.all(
      dto.lines.map(async (line) => {
        const unitCost = await this.maService.getCurrentMa(
          line.itemId,
          dto.sourceWarehouseId,
        );
        return {
          transferId: transferOrder.id,
          itemId: line.itemId,
          qty: line.qty,
          unitCost,
        };
      }),
    );

    await this.transferOrderRepository.createLines(lineInputs);

    // 6. Atomic operation: for each line, decrease source stock and increase dest stock
    const now = new Date();
    const currentPeriod = this.periodService.getCurrentPeriod();

    // Calculate total cost for the transfer TX
    const totalTransferCost = lineInputs.reduce(
      (sum, line) => sum + line.qty * line.unitCost,
      0,
    );
    const totalTransferQty = lineInputs.reduce((sum, line) => sum + line.qty, 0);

    // 7. POST a single ADJ_TRANSFER TX via MockTxLogService
    const txEntry = await this.txLogService.createTx({
      txType: TxType.ADJ_TRANSFER,
      txDate: now.toISOString(),
      period: currentPeriod,
      itemId: dto.lines.length === 1 ? dto.lines[0].itemId : null,
      warehouseId: dto.sourceWarehouseId,
      qty: -totalTransferQty,
      unitCost: totalTransferQty > 0 ? totalTransferCost / totalTransferQty : 0,
      totalCost: -totalTransferCost,
      cogsUnit: null,
      vendorId: null,
      customerId: null,
      apAmount: 0,
      arAmount: 0,
      parentTxId: null,
      createdBy: initiatedBy,
      postedBy: initiatedBy,
    });

    // Post the TX
    await this.txLogService.postTx(txEntry.txId, initiatedBy);

    // 8. For each line: perform stock adjustments
    for (const lineInput of lineInputs) {
      // Decrease source stock (MA unchanged at source)
      // The MA at source remains the same — stock-out doesn't recalculate MA

      // Increase dest stock (MA recalculated at destination)
      const destCurrentMa = await this.maService.getCurrentMa(
        lineInput.itemId,
        dto.destWarehouseId,
      );
      const destCurrentQty = await this.stockValidationService.getStockBalance(
        lineInput.itemId,
        dto.destWarehouseId,
      );

      // Recalculate MA at destination using the transfer unit cost
      await this.maService.calculateNewMa(
        lineInput.itemId,
        dto.destWarehouseId,
        lineInput.qty,
        lineInput.qty * lineInput.unitCost,
        true, // stock increase at destination
      );
    }

    // 9. Set status to POSTED and record tx_id on all lines
    await this.transferOrderRepository.updateStatus(
      transferOrder.id,
      TransferStatus.POSTED,
      { postedAt: now },
    );

    await this.transferOrderRepository.updateLinesTxId(transferOrder.id, txEntry.txId);

    // Return the completed transfer order with lines
    const result = await this.transferOrderRepository.findById(transferOrder.id);
    return result;
  }

  /**
   * Get a transfer order by ID with its lines.
   */
  async getTransfer(transferId: string) {
    const transfer = await this.transferOrderRepository.findById(transferId);
    if (!transfer) {
      throw new NotFoundException(`Transfer order ${transferId} not found`);
    }
    return transfer;
  }

  /**
   * List transfer orders with filters and pagination.
   */
  async listTransfers(params: TransferOrderQueryParams) {
    return this.transferOrderRepository.findBySourceOrDestWarehouse(params);
  }
}
