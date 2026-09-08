import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveCardDto {
  @ApiProperty({ example: '8451234567', description: 'Customer mobile number' })
  @IsNotEmpty()
  @IsString()
  customerNumber: string;

  @ApiProperty({ example: '4111111111111111' })
  @IsNotEmpty()
  @IsString()
  cardNumber: string;

  @ApiProperty({ example: '1228' })
  @IsNotEmpty()
  @IsString()
  expiration: string;

  @ApiProperty({ example: '123' })
  @IsNotEmpty()
  @IsString()
  cvv: string;

  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  cardholder?: string;
}
