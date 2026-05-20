import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsString, IsUUID, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GoodsReceiptItemDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(1)
  qty!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsNumber()
  @Min(0)
  landedCost!: number;
}

export class CreateGoodsReceiptDto {
  @IsUUID()
  vendorId!: string;

  @IsString()
  @IsNotEmpty()
  taxInvoiceNo!: string;

  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'period must be in YYYY-MM format' })
  period!: string;
}
