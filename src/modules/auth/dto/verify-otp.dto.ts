import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
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

  @ApiProperty({
    example: '9999',
  })
  @IsString()
  @IsNotEmpty()
  otp: string;
}
