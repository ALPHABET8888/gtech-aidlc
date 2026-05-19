import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WriteOffStatus } from '@prisma/client';

export class WriteOffQueryDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse ID', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({
    description: 'Filter by write-off status',
    enum: WriteOffStatus,
  })
  @IsEnum(WriteOffStatus)
  @IsOptional()
  status?: WriteOffStatus;

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
