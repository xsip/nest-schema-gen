import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { UserDetailsDto } from './UserDetailsDto';
import { Roles } from './Roles';

export class UserDto {
  @ApiProperty({ type: 'string' })
  @IsString()
  username!: string;

  @ApiProperty({ type: () => UserDetailsDto })
  @ValidateNested()
  @Type(() => UserDetailsDto)
  details!: UserDetailsDto;

  @ApiProperty({ type: 'string' })
  @IsString()
  email!: string;

  @ApiProperty({ type: 'string' })
  @IsString()
  password!: string;

  @ApiProperty({
    required: false,
    isArray: true,
    enum: Roles,
  })
  @IsOptional()
  @IsArray()
  roles?: Roles[];

  @ApiProperty({
    isArray: true,
    enum: ['test1', 'test2', 'test3'],
  })
  @IsArray()
  inlineRoles!: ('test1' | 'test2' | 'test3')[];
}
