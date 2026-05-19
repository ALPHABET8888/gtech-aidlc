import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CountSessionItemDto {
  @ApiProperty({ description: 'Item ID to include in count session', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId!: string;
}

export class CreateCountSessionDto {
  @ApiProperty({ description: 'Warehouse ID to perform stock count', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId!: string;

  @ApiProperty({
    description: 'List of items to count',
    type: [CountSessionItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountSessionItemDto)
  @IsNotEmpty()
  items!: CountSessionItemDto[];

  @ApiPropertyOptional({ description: 'Optional notes for the count session' })
  @IsString()
  @IsOptional()
  notes?: string;
}
