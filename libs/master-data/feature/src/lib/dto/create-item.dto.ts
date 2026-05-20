import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new Item.
 */
export class CreateItemDto {
  @ApiProperty({
    description: 'Unique item code',
    example: 'ITM-001',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiProperty({
    description: 'Item name',
    example: 'น้ำมันเครื่อง 10W-40',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description: 'Unit of measure',
    example: 'ลิตร',
    maxLength: 20,
  })
  @IsString()
  @MaxLength(20)
  unit!: string;

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
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
