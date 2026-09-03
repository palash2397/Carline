import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BookIvrRideDto {
  @ApiProperty({ example: 'Local_Rides' })
  @IsOptional()
  @IsString()
  queueName?: string;

  @ApiProperty({ example: '8887776665' })
  @IsOptional()
  @IsString()
  driverNumber?: string;

  @ApiProperty({ example: '8451234567' })
  @IsNotEmpty()
  @IsString()
  customerNumber: string;

  @ApiProperty({ example: 'https://aws.s3.../recording.mp3' })
  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @ApiProperty({ example: '2026-09-01T12:00:00Z' })
  @IsOptional()
  @IsString()
  rideStart?: string;
}
