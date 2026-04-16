import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UserDetailsDto {
  @ApiProperty({ type: 'string' })
  @IsString()
  firstname!: string;

  @ApiProperty({ type: 'string' })
  @IsString()
  lastname!: string;

  @ApiProperty({
    required: false,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  address?: string;
}
