import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentAllocationDto } from './payment-allocation.dto';

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  CHEQUE = 'CHEQUE',
}

export class MakeApPaymentDto {
  @IsUUID()
  vendorId!: string;

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
