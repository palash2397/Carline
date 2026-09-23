import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateDriverBatchDto {
  @ApiProperty({
    example: '691379738f253f6ef929c88d',
    description:
      'Driver ID (Mongo ObjectId, numeric driverId, or mobile number)',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  driverId: string;

  @ApiProperty({
    example: 1,
    description: 'Batch Number',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  batchNumber?: number;

  @ApiProperty({
    example: 1,
    description: 'Batch Number (alias)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  batch?: number;
}

