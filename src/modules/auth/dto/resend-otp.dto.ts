import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResendOtpDto {
  @ApiProperty({
    example: '+91',
  })
  @IsString()
  @IsNotEmpty()
  countryCode: string;

  @ApiProperty({
    example: '9876543210',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
