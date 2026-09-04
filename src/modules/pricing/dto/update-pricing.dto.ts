import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdatePricingDto {
  @ApiProperty({ example: 2.0, description: 'Base fare starting cost' })
  @IsNotEmpty()
  @IsNumber()
  baseFare: number;

  @ApiProperty({ example: 5, description: 'Base included time in minutes' })
  @IsNotEmpty()
  @IsNumber()
  baseTimeMinutes: number;

  @ApiProperty({ example: 2.0, description: 'Per minute rate after base time' })
  @IsNotEmpty()
  @IsNumber()
  perMinuteRate: number;

  @ApiProperty({ example: 'USD', required: false })
  @IsOptional()
  @IsString()
  currency?: string;
}
