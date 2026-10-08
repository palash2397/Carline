import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BalanceAdjustmentType } from '../schema/customer-balance-history.schema';

export class AdjustCustomerBalanceDto {
  @ApiProperty({
    example: '691aa8f81c36af5462c4551c',
    description: 'Customer ID, phone number, or numeric customerId',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({
    example: BalanceAdjustmentType.ADD,
    enum: BalanceAdjustmentType,
    description: 'Action to perform: ADD or DEDUCT',
    required: true,
  })
  @IsNotEmpty()
  @IsEnum(BalanceAdjustmentType)
  action: BalanceAdjustmentType;

  @ApiProperty({
    example: 100,
    description: 'Amount to add or deduct',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    example: 'Manual balance adjustment by admin',
    description: 'Reason for the adjustment',
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
