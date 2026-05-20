import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new Warehouse.
 */
export class CreateWarehouseDto {
  @ApiProperty({
    description: 'Unique warehouse code',
    example: 'WH-001',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty({
    description: 'Warehouse name',
    example: 'คลังสินค้าหลัก',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  name!: string;

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
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
