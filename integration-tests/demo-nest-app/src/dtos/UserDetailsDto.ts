import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UserDetailsDto {
  /** User's first name */
  @ApiProperty({
    description: `User's first name`,
    type: 'string',
  })
  @IsString()
  firstname!: string;

  /** User's last name */
  @ApiProperty({
    description: `User's last name`,
    type: 'string',
  })
  @IsString()
  lastname!: string;

  /** Optional physical address of the user */
  @ApiProperty({
    required: false,
    description: `Optional physical address of the user`,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  address?: string;
}
