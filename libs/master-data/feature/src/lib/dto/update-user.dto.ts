import { IsString, IsOptional, IsBoolean, IsEmail, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating an existing User.
 * All fields are optional — only provided fields are updated.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Unique username for login',
    example: 'john.doe',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @MinLength(3)
  username?: string;

  @ApiPropertyOptional({
    description: 'New password (will be hashed)',
    example: 'NewSecureP@ss456',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    description: 'Full display name',
    example: 'สมชาย ใจดี',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'somchai@company.co.th',
    maxLength: 100,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({
    description: 'Whether the user account is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
