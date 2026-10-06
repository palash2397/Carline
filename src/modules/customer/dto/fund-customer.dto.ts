import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsNotEmpty,
  Min,
} from 'class-validator';

export class FundCustomerDto {
  @ApiProperty({
    example: '691aa8f81c36af5462c4551c',
    description: 'Customer ID',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({
    example: 1000,
    description: 'Amount to be added',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;
}
