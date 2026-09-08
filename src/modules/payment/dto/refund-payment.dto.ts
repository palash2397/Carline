import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RefundPaymentDto {
  @ApiProperty({ example: '1002345', description: 'USAePay Transaction Refnum' })
  @IsNotEmpty()
  @IsString()
  transactionId: string;

  @ApiProperty({ example: 25.5, description: 'Amount to refund' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'Customer requested cancellation', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
