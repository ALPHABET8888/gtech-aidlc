import { IsString, IsOptional, IsBoolean, IsEmail, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating an existing Customer.
 * All fields are optional — only provided fields are updated.
 */
export class UpdateCustomerDto {
  @ApiPropertyOptional({
    description: 'Unique customer code',
    example: 'CUS-001',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({
    description: 'Customer name',
    example: 'บริษัท เอบีซี จำกัด',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '02-987-6543',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'info@abc-company.co.th',
    maxLength: 100,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({
    description: 'Customer address',
    example: '456 ถ.พหลโยธิน กรุงเทพฯ 10400',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Tax ID',
    example: '0105559012345',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;

  @ApiPropertyOptional({
    description: 'Whether the customer is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
