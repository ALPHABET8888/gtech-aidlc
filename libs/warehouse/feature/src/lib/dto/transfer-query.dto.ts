import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransferStatus } from '@prisma/client';

export class TransferQueryDto {
  @ApiPropertyOptional({ description: 'Filter by source warehouse ID', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  sourceWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by destination warehouse ID', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  destWarehouseId?: string;

  @ApiPropertyOptional({
    description: 'Filter by transfer status',
    enum: TransferStatus,
  })
  @IsEnum(TransferStatus)
  @IsOptional()
  status?: TransferStatus;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
