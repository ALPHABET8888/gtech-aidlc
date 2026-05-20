import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating (opening) a new accounting period.
 */
export class CreatePeriodDto {
  @ApiProperty({
    description: 'Period identifier in YYYY-MM format',
    example: '2025-02',
  })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'period must be in YYYY-MM format',
  })
  period!: string;
}
