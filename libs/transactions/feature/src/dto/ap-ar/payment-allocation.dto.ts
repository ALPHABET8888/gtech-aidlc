import { IsNumber, IsUUID, Min } from 'class-validator';

export class PaymentAllocationDto {
  @IsUUID()
  openItemId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
