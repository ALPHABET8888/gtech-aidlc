import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GoodsReturnItemDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(1)
  qty!: number;
}

export class CreateGoodsReturnDto {
  @IsUUID()
  refGrTxId!: string;

  @IsUUID()
  vendorId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReturnItemDto)
  items!: GoodsReturnItemDto[];

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
