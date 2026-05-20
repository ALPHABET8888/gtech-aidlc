import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for assigning roles to a user.
 */
export class AssignRolesDto {
  @ApiProperty({
    description: 'Array of role IDs to assign to the user',
    example: ['550e8400-e29b-41d4-a716-446655440001'],
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
