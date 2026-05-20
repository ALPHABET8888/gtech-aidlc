import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class CreateSalesPriceAdjDto {
  @IsUUID()
  refInvoiceTxId!: string;

  @IsNumber()
  @Min(0.01)
  adjustmentAmount!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
