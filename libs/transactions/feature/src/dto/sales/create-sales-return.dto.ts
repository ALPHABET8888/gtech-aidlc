import { ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsNumber, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReturnCondition {
  GOOD = 'good',
  DAMAGED_TOTAL = 'damaged_total',
}

export class SalesReturnItemDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(1)
  qty!: number;

  @IsUUID()
  warehouseId!: string;
}

export class CreateSalesReturnDto {
  @IsUUID()
  refInvoiceTxId!: string;

  @IsEnum(ReturnCondition)
  condition!: ReturnCondition;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesReturnItemDto)
  items!: SalesReturnItemDto[];

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
