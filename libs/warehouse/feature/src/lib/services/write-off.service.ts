import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WriteOffRepository,
  WriteOffQueryParams,
} from '@autoflow/warehouse-data-access';
import {
  IStockValidationService,
  IMaCalculationService,
  ITxLogService,
  IPeriodService,
  TxType,
  Role,
} from '@autoflow/shared-types';
import { WAREHOUSE_DI_TOKENS } from '../mocks/di-tokens';
import { CreateWriteOffDto } from '../dto/create-write-off.dto';
import { WriteOffStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

export interface ApproveWriteOffContext {
  userId: string;
  roles: Role[];
}

@Injectable()
export class WriteOffService {
  private readonly uploadsBaseDir: string;

  constructor(
    private readonly writeOffRepository: WriteOffRepository,
    @Inject(WAREHOUSE_DI_TOKENS.STOCK_VALIDATION_SERVICE)
    private readonly stockValidationService: IStockValidationService,
    @Inject(WAREHOUSE_DI_TOKENS.MA_SERVICE)
    private readonly maService: IMaCalculationService,
    @Inject(WAREHOUSE_DI_TOKENS.TX_LOG_SERVICE)
    private readonly txLogService: ITxLogService,
    @Inject(WAREHOUSE_DI_TOKENS.PERIOD_SERVICE)
    private readonly periodService: IPeriodService,
  ) {
    this.uploadsBaseDir = path.resolve(process.cwd(), 'uploads', 'write-offs');
  }

  /**
   * Create a write-off request.
   * - Validates stock is sufficient via MockStockValidationService
   * - Captures current MA as unit_cost
   * - Calculates total_loss = qty × unit_cost
   * - Handles salvage_value if provided (net_loss = total_loss - salvage_value)
   * - Creates WriteOffRequest with PENDING_APPROVAL status
   */
  async requestWriteOff(dto: CreateWriteOffDto, requestedBy: string) {
    // Validate stock is sufficient
    await this.stockValidationService.validateStockAvailability(
      dto.itemId,
      dto.warehouseId,
      dto.qty,
    );

    // Capture current MA as unit_cost
    const unitCost = await this.maService.getCurrentMa(dto.itemId, dto.warehouseId);

    // Calculate total_loss = qty × unit_cost
    const totalLoss = dto.qty * unitCost;

    // Salvage value defaults to 0
    const salvageValue = dto.salvageValue ?? 0;

    // Create the write-off request with PENDING_APPROVAL status
    const writeOff = await this.writeOffRepository.create({
      warehouseId: dto.warehouseId,
      itemId: dto.itemId,
      qty: dto.qty,
      unitCost,
      totalLoss,
      salvageValue,
      reason: dto.reason,
      requestedBy,
    });

    return writeOff;
  }

  /**
   * Upload evidence file for a write-off request.
   * - Saves file to local uploads directory (uploads/write-offs/{writeOffId}/)
   * - Creates WriteOffEvidence record with file metadata
   */
  async uploadEvidence(writeOffId: string, file: UploadedFile, uploadedBy: string) {
    // Validate write-off exists
    const writeOff = await this.writeOffRepository.findById(writeOffId);
    if (!writeOff) {
      throw new NotFoundException(`Write-off request ${writeOffId} not found`);
    }

    // Validate write-off is still in PENDING_APPROVAL status
    if (writeOff.status !== WriteOffStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot upload evidence: write-off is in ${writeOff.status} status`,
      );
    }

    // Create upload directory for this write-off
    const uploadDir = path.join(this.uploadsBaseDir, writeOffId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename to avoid collisions
    const timestamp = Date.now();
    const safeFileName = `${timestamp}-${file.originalname}`;
    const filePath = path.join(uploadDir, safeFileName);

    // Save file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Create evidence record
    const evidence = await this.writeOffRepository.createEvidence({
      writeOffId,
      fileName: file.originalname,
      filePath,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedBy,
    });

    return evidence;
  }

  /**
   * Approve a write-off request (CFO only).
   * - Validates at least 1 evidence exists
   * - Validates user has CFO role
   * - Validates stock won't go negative via MockStockValidationService
   * - POSTs ADJ_WRITEOFF via MockTxLogService (decrease stock, MA unchanged)
   * - Sets status to POSTED, records tx_id
   */
  async approveWriteOff(writeOffId: string, context: ApproveWriteOffContext) {
    // Validate user has CFO role
    if (!context.roles.includes(Role.CFO)) {
      throw new ForbiddenException('Only CFO can approve write-off requests');
    }

    // Validate write-off exists
    const writeOff = await this.writeOffRepository.findById(writeOffId);
    if (!writeOff) {
      throw new NotFoundException(`Write-off request ${writeOffId} not found`);
    }

    // Validate write-off is in PENDING_APPROVAL status
    if (writeOff.status !== WriteOffStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve: write-off is in ${writeOff.status} status`,
      );
    }

    // Validate at least 1 evidence exists
    const evidenceCount = await this.writeOffRepository.countEvidenceByWriteOffId(writeOffId);
    if (evidenceCount === 0) {
      throw new BadRequestException(
        'Cannot approve write-off: at least 1 evidence file must be uploaded',
      );
    }

    // Validate stock won't go negative
    const qty = Number(writeOff.qty);
    await this.stockValidationService.validateStockAvailability(
      writeOff.itemId,
      writeOff.warehouseId,
      qty,
    );

    const now = new Date();
    const unitCost = Number(writeOff.unitCost);
    const totalCost = qty * unitCost;

    // Get current period for TX entry
    const currentPeriod = this.periodService.getCurrentPeriod();

    // POST ADJ_WRITEOFF via MockTxLogService (decrease stock, MA unchanged)
    const txEntry = await this.txLogService.createTx({
      txType: TxType.ADJ_WRITEOFF,
      txDate: now.toISOString(),
      period: currentPeriod,
      itemId: writeOff.itemId,
      warehouseId: writeOff.warehouseId,
      qty: -qty, // Negative = stock decrease
      unitCost,
      totalCost: -totalCost, // Negative = loss
      cogsUnit: null,
      vendorId: null,
      customerId: null,
      apAmount: 0,
      arAmount: 0,
      parentTxId: null,
      createdBy: context.userId,
      postedBy: context.userId,
    });

    // Post the TX
    await this.txLogService.postTx(txEntry.txId, context.userId);

    // Update write-off status to POSTED with tx_id
    const updatedWriteOff = await this.writeOffRepository.updateStatus(
      writeOffId,
      WriteOffStatus.POSTED,
      {
        approvedBy: context.userId,
        approvedAt: now,
        txId: txEntry.txId,
      },
    );

    return updatedWriteOff;
  }

  /**
   * Get a write-off request by ID with its evidence.
   */
  async getWriteOff(id: string) {
    const writeOff = await this.writeOffRepository.findById(id);
    if (!writeOff) {
      throw new NotFoundException(`Write-off request ${id} not found`);
    }
    return writeOff;
  }

  /**
   * List write-off requests with filters and pagination.
   */
  async listWriteOffs(params: WriteOffQueryParams) {
    return this.writeOffRepository.findByWarehouseAndStatus(params);
  }
}
