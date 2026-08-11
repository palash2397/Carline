import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRideTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsNumber()
  baseFare: number;

  @ApiProperty()
  @IsNumber()
  perKmCharge: number;

  @ApiProperty()
  @IsNumber()
  perMinuteCharge: number;

  @ApiProperty()
  @IsNumber()
  minimumFare: number;

  @ApiProperty()
  @IsNumber()
  seats: number;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  image?: any;
}
