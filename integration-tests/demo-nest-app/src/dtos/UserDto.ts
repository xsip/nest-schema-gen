import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { UserDetailsDto } from './UserDetailsDto';
import { Roles } from './Roles';

export class UserDto {
  /** Unique username used for login or identification */
  @ApiProperty({
    description: `Unique username used for login or identification`,
    type: 'string',
  })
  @IsString()
  username!: string;

  /** Nested object containing personal details of the user */
  @ApiProperty({
    description: `Nested object containing personal details of the user`,
    type: () => UserDetailsDto,
  })
  @ValidateNested()
  @Type(() => UserDetailsDto)
  details!: UserDetailsDto;

  /** User's email address for contact and authentication */
  @ApiProperty({
    description: `User's email address for contact and authentication`,
    type: 'string',
  })
  @IsString()
  email!: string;

  /** User's password (should be stored securely, e.g., hashed) */
  @ApiProperty({
    description: `User's password (should be stored securely, e.g., hashed)`,
    type: 'string',
  })
  @IsString()
  password!: string;

  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  @ApiProperty({
    required: false,
    description: `Optional list of roles assigned to the user (e.g., USER, ADMIN)`,
    isArray: true,
    enum: Roles,
  })
  @IsOptional()
  @IsArray()
  roles?: Roles[];

  /** Array of inline role identifiers with limited predefined values */
  @ApiProperty({
    description: `Array of inline role identifiers with limited predefined values`,
    isArray: true,
    enum: ['test1', 'test2', 'test3'],
  })
  @IsArray()
  inlineRoles!: ('test1' | 'test2' | 'test3')[];
}
