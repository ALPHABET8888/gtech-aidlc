import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating an existing Warehouse.
 * All fields are optional — only provided fields are updated.
 */
export class UpdateWarehouseDto {
  @ApiPropertyOptional({
    description: 'Unique warehouse code',
    example: 'WH-001',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({
    description: 'Warehouse name',
    example: 'คลังสินค้าหลัก',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Physical location',
    example: 'อาคาร A ชั้น 1',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @ApiPropertyOptional({
    description: 'Whether the warehouse is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
