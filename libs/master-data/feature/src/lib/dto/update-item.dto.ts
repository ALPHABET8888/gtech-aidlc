import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating an existing Item.
 * All fields are optional — only provided fields are updated.
 */
export class UpdateItemDto {
  @ApiPropertyOptional({
    description: 'Unique item code',
    example: 'ITM-001',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({
    description: 'Item name',
    example: 'น้ำมันเครื่อง 10W-40',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Unit of measure',
    example: 'ลิตร',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({
    description: 'Item category',
    example: 'น้ำมันหล่อลื่น',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({
    description: 'Whether the item is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
