import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class DeductCustomerDto {
  @ApiProperty({
    example: '691aa8f81c36af5462c4551c',
    description: 'Customer ID, phone number, or numeric customerId',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({
    example: 50,
    description: 'Amount to be deducted from customer balance',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    example: 'Disputed fare correction or manual withdrawal',
    description: 'Reason for deducting the balance',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({
    example: false,
    description:
      'Whether to allow deduction if it results in a negative balance (default: false)',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;
}
