import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TxStatus } from '@prisma/client';

/**
 * Query parameters DTO for GET /tx endpoint.
 * All fields are optional filters with pagination.
 */
export class QueryTxDto {
  @ApiPropertyOptional({ description: 'Filter by transaction type' })
  @IsOptional()
  @IsString()
  txType?: string;

  @ApiPropertyOptional({
    description: 'Filter by transaction status',
    enum: TxStatus,
  })
  @IsOptional()
  @IsEnum(TxStatus)
  txStatus?: TxStatus;

  @ApiPropertyOptional({
    description: 'Filter by accounting period (YYYY-MM)',
    example: '2025-01',
  })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ description: 'Filter by item ID (UUID)' })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID (UUID)' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size (1-100)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
