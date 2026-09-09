import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class UpdateDriverEarningsDto {
  @ApiProperty({
    example: '691379738f253f6ef929c88d',
    description: 'Driver ID (Mongo ObjectId, numeric driverId, or mobile number)',
    required: true,
  })
  @IsNotEmpty()
  driverId: any;

  @ApiProperty({
    example: 4096.5,
    description: 'Earnings with cash',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  earningsWithCash?: number;

  @ApiProperty({
    example: 9,
    description: 'Earnings without cash (card/account)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  earningsWithoutCash?: number;

  @ApiProperty({
    example: 4105.5,
    description: 'Total driver earnings',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  totalEarnings?: number;

  @ApiProperty({
    example: 4105.5,
    description: 'Total driver earnings alias',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  earnings?: number;
}
