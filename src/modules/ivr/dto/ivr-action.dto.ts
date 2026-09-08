import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class IvrDriverActionDto {
  @ApiProperty({ example: '9074775130', required: false })
  @IsOptional()
  @IsString()
  callerNumber?: string;

  @ApiProperty({ example: '9074775130', required: false })
  @IsOptional()
  @IsString()
  driverNumber?: string;

  @ApiProperty({ example: '9074775130', required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ example: 'OVERRIDE_FARE', required: false })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({ example: 2500, description: 'Override fare in integer cents (e.g. 2500 = $25.00)', required: false })
  @IsOptional()
  overrideAmountCents?: number;

  @ApiProperty({ example: 25.0, description: 'Override fare in dollars', required: false })
  @IsOptional()
  overrideAmount?: number;

  @ApiProperty({ example: 2500, required: false })
  @IsOptional()
  amountCents?: number;

  @ApiProperty({ example: 25.0, required: false })
  @IsOptional()
  amount?: number;

  @ApiProperty({ example: '4', required: false })
  @IsOptional()
  @IsString()
  dtmfInput?: string;
}

export class IvrDispatchActionDto {
  @ApiProperty({ example: 'customer-0426bfae-09fe-4258-9af8-b003e0114b07', required: false })
  @IsOptional()
  @IsString()
  dispatchId?: string;

  @ApiProperty({ example: 'TRIP-123456', required: false })
  @IsOptional()
  @IsString()
  tripNumber?: string;

  @ApiProperty({ example: '1234567890' })
  @IsNotEmpty()
  @IsString()
  driverNumber: string;

  @ApiProperty({ example: '1' })
  @IsNotEmpty()
  @IsString()
  dtmfInput: string;
}
