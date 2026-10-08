import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  Min,
} from 'class-validator';

export class FundCustomerDto {
  @ApiProperty({
    example: '691aa8f81c36af5462c4551c',
    description: 'Customer ID, phone number, or numeric customerId',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({
    example: 100,
    description: 'Amount to be added',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    example: 'Prepaid deposit by customer',
    description: 'Reason or note for adding credit',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
