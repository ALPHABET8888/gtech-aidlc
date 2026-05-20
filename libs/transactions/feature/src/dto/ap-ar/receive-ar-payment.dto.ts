import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentAllocationDto } from './payment-allocation.dto';
import { PaymentMethod } from './make-ap-payment.dto';

export class ReceiveArPaymentDto {
  @IsUUID()
  customerId!: string;

  @IsNumber()
  @Min(0.01)
  totalAmount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  paymentRef?: string;
}
