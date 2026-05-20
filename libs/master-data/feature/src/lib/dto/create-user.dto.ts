import { IsString, IsOptional, IsBoolean, IsEmail, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new User.
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'Unique username for login',
    example: 'john.doe',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  @MinLength(3)
  username!: string;

  @ApiProperty({
    description: 'User password (will be hashed)',
    example: 'SecureP@ss123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    description: 'Full display name',
    example: 'สมชาย ใจดี',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  fullName!: string;

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
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
