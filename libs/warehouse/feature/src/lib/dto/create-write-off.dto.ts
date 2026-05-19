import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWriteOffDto {
  @ApiProperty({ description: 'Warehouse ID where write-off occurs', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId!: string;

  @ApiProperty({ description: 'Item ID to write off', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ description: 'Quantity to write off', minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  qty!: number;

  @ApiProperty({ description: 'Reason for write-off' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'Salvage value if applicable (default 0)', minimum: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  salvageValue?: number;
}
