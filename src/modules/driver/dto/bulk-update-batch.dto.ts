import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsMongoId, IsNotEmpty, IsNumber } from 'class-validator';

export class BulkUpdateDriverBatchDto {
  @ApiProperty({
    example: ['691379738f253f6ef929c88d', '691379738f253f6ef929c88e'],
    description: 'Array of Driver ObjectIds to assign to the batch',
    required: true,
    type: [String],
  })
  @IsNotEmpty()
  @IsArray()
  @IsMongoId({ each: true })
  driverIds: string[];

  @ApiProperty({
    example: 1,
    description: 'Batch Number to assign to all specified drivers',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  batchNumber: number;
}
