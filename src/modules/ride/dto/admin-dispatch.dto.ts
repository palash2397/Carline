import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AdminDispatchDto {
  @ApiProperty({ example: '123 Main St' })
  @IsNotEmpty()
  @IsString()
  pickupLocation: string;

  @ApiProperty({ example: '456 Market St' })
  @IsNotEmpty()
  @IsString()
  dropoffLocation: string;

  @ApiProperty({ example: '8451234567' })
  @IsNotEmpty()
  @IsString()
  customerNumber: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  customerName: string;

  @ApiProperty({ example: 'LOCAL' }) // LOCAL or LONG_DISTANCE
  @IsNotEmpty()
  @IsString()
  queueName: string;
}
