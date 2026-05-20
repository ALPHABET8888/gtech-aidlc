import { ArrayMinSize, IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceItemDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(1)
  qty!: number;
}

export class IssueInvoiceDto {
  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}
