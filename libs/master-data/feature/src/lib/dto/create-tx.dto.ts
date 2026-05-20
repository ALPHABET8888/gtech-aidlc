import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TxType, VatType } from '@prisma/client';

/**
 * DTO for creating a new transaction via the POST pipeline.
 * All validations are handled by class-validator decorators.
 */
export class CreateTxDto {
  @ApiProperty({
    description: 'Transaction type',
    enum: TxType,
    example: 'GR_RECEIVE',
  })
  @IsEnum(TxType)
  txType!: TxType;

  @ApiProperty({
    description: 'Transaction date in ISO 8601 format',
    example: '2025-01-20T00:00:00Z',
  })
  @IsDateString()
  txDate!: string;

  @ApiProperty({
    description: 'Accounting period in YYYY-MM format',
    example: '2025-01',
  })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'period must be in YYYY-MM format',
  })
  period!: string;

  @ApiPropertyOptional({ description: 'Item ID (for stock-affecting TX)' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Warehouse ID' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Quantity (positive=increase, negative=decrease)' })
  @IsOptional()
  @IsNumber()
  qty?: number;

  @ApiPropertyOptional({ description: 'Unit cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Total cost (qty × unitCost)' })
  @IsOptional()
  @IsNumber()
  totalCost?: number;

  @ApiPropertyOptional({ description: 'Vendor ID' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({ description: 'Customer ID' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Reference to Job Order TX' })
  @IsOptional()
  @IsUUID()
  refJoId?: string;

  @ApiPropertyOptional({ description: 'Reference to TEMP_DO TX' })
  @IsOptional()
  @IsUUID()
  refDoId?: string;

  @ApiPropertyOptional({ description: 'Reference to Invoice TX' })
  @IsOptional()
  @IsUUID()
  refInvoiceId?: string;

  @ApiPropertyOptional({ description: 'Reference to GR_RECEIVE TX' })
  @IsOptional()
  @IsUUID()
  refGrId?: string;

  @ApiPropertyOptional({ description: 'Reference to CN TX' })
  @IsOptional()
  @IsUUID()
  refCnId?: string;

  @ApiPropertyOptional({ description: 'Parent TX ID (for VOID)' })
  @IsOptional()
  @IsUUID()
  parentTxId?: string;

  @ApiPropertyOptional({ description: 'Tax invoice number' })
  @IsOptional()
  @IsString()
  taxInvoiceNo?: string;

  @ApiPropertyOptional({ description: 'Base amount before VAT' })
  @IsOptional()
  @IsNumber()
  baseAmount?: number;

  @ApiPropertyOptional({ description: 'VAT amount' })
  @IsOptional()
  @IsNumber()
  vatAmount?: number;

  @ApiPropertyOptional({ description: 'VAT type', enum: VatType })
  @IsOptional()
  @IsEnum(VatType)
  vatType?: VatType;

  @ApiPropertyOptional({ description: 'AR amount' })
  @IsOptional()
  @IsNumber()
  arAmount?: number;

  @ApiPropertyOptional({ description: 'AP amount' })
  @IsOptional()
  @IsNumber()
  apAmount?: number;

  @ApiPropertyOptional({ description: 'Reason (for CN, VOID)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
