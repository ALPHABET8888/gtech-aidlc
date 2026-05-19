import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferLineDto {
  @ApiProperty({ description: 'Item ID to transfer', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ description: 'Quantity to transfer', minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  qty!: number;
}

export class CreateTransferDto {
  @ApiProperty({ description: 'Source warehouse ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  sourceWarehouseId!: string;

  @ApiProperty({ description: 'Destination warehouse ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  destWarehouseId!: string;

  @ApiProperty({
    description: 'List of items and quantities to transfer',
    type: [TransferLineDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  @IsNotEmpty()
  lines!: TransferLineDto[];

  @ApiPropertyOptional({ description: 'Optional notes for the transfer' })
  @IsString()
  @IsOptional()
  notes?: string;
}
