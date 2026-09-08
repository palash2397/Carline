import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ChargeRidePaymentDto {
  @ApiProperty({ example: 'TRIP-123456-789' })
  @IsNotEmpty()
  @IsString()
  tripNumber: string;

  @ApiProperty({ example: 32.5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiProperty({ example: 'cust_12345', required: false, description: 'USAePay Customer Vault ID' })
  @IsOptional()
  @IsString()
  customerId?: string;
}
