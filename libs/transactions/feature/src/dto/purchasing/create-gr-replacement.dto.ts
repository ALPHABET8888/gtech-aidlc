import { ArrayMinSize, IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GrReplacementItemDto {
  @IsUUID()
  itemId!: string;

  @IsNumber()
  @Min(1)
  qty!: number;
}

export class CreateGrReplacementDto {
  @IsUUID()
  refGrReturnTxId!: string;

  @IsUUID()
  clearingId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GrReplacementItemDto)
  items!: GrReplacementItemDto[];
}
