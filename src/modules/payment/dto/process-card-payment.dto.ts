import { ApiProperty } from '@nestjs/swagger';
import {
  IsCreditCard,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ProcessCardPaymentDto {
  @ApiProperty({ example: 'TRIP-123456-789', required: false })
  @IsOptional()
  @IsString()
  tripNumber?: string;

  @ApiProperty({ example: '66d3a8e...', required: false })
  @IsOptional()
  @IsString()
  rideId?: string;

  @ApiProperty({ example: 25.5, description: 'Amount to charge in dollars' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: '4111111111111111', description: 'Credit Card Number' })
  @IsNotEmpty()
  @IsString()
  cardNumber: string;

  @ApiProperty({ example: '1228', description: 'Expiration Date (MMYY)' })
  @IsNotEmpty()
  @IsString()
  expiration: string;

  @ApiProperty({ example: '123', description: 'Card CVV/CVC Code' })
  @IsNotEmpty()
  @IsString()
  cvv: string;

  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  cardholder?: string;
}
