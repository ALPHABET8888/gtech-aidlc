import { IsString, IsOptional, IsBoolean, IsEmail, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating an existing Vendor.
 * All fields are optional — only provided fields are updated.
 */
export class UpdateVendorDto {
  @ApiPropertyOptional({
    description: 'Unique vendor code',
    example: 'VND-001',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({
    description: 'Vendor name',
    example: 'บริษัท สยามซัพพลาย จำกัด',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '02-123-4567',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'contact@siamsupply.co.th',
    maxLength: 100,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({
    description: 'Vendor address',
    example: '123 ถ.สุขุมวิท กรุงเทพฯ 10110',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'Tax ID',
    example: '0105556012345',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;

  @ApiPropertyOptional({
    description: 'Whether the vendor is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
