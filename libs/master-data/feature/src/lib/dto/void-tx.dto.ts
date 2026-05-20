import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for voiding a transaction.
 * A reason is required to explain why the transaction is being voided.
 */
export class VoidTxDto {
  @ApiProperty({
    description: 'Reason for voiding the transaction',
    example: 'Incorrect quantity recorded — vendor confirmed different shipment',
  })
  @IsString()
  @IsNotEmpty({ message: 'Void reason is required' })
  reason!: string;
}
