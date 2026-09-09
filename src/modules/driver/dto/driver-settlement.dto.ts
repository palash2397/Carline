import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DriverSettlementDto {
  @ApiProperty({
    example: '691379738f253f6ef929c88d',
    description: 'Driver ID (Mongo ObjectId, numeric driverId, or mobile number)',
    required: true,
  })
  @IsNotEmpty()
  driverId: any;

  @ApiProperty({
    example: 500,
    description: 'Settlement amount to deduct from driver balance',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    example: 'TOTAL',
    description: 'Target balance: CASH, NON_CASH, or TOTAL',
    required: false,
    default: 'TOTAL',
  })
  @IsOptional()
  @IsString()
  settlementType?: string;

  @ApiProperty({
    example: 'BANK_TRANSFER',
    description: 'Payment method used: CASH, BANK_TRANSFER, CHEQUE, etc.',
    required: false,
    default: 'BANK_TRANSFER',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiProperty({
    example: 'Weekly earnings payout',
    description: 'Note, reason, or settlement transaction reference',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({
    example: 'ADMIN',
    description: 'User or Admin performing the settlement',
    required: false,
  })
  @IsOptional()
  @IsString()
  updatedBy?: string;
}
