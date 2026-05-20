import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateCnPriceAdjDto {
  @IsUUID()
  refGrTxId!: string;

  @IsNumber()
  @Min(0.01)
  adjustmentPerUnit!: number;

  @IsNumber()
  @Min(1)
  qty!: number;
}
