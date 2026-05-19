import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordCountResultDto {
  @ApiProperty({ description: 'Physical quantity counted', minimum: 0 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  physicalQty!: number;

  @ApiPropertyOptional({ description: 'Reason code for difference (required if difference != 0)' })
  @IsString()
  @IsOptional()
  reasonCode?: string;
}
