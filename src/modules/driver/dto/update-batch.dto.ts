import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class UpdateDriverBatchDto {
  @ApiProperty({
    example: '691379738f253f6ef929c88d',
    description:
      'Driver ID (Mongo ObjectId, numeric driverId, or mobile number)',
    required: true,
  })
  @IsNotEmpty()
  @IsMongoId()
  driverId: string;

  @ApiProperty({
    example: 4096.5,
    description: 'Batch Number',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  batchNumber: number;
}
