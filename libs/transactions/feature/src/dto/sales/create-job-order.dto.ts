import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class JobOrderItemDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(1)
  qty!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateJobOrderDto {
  @IsUUID()
  customerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JobOrderItemDto)
  items!: JobOrderItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
