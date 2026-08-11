import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class CancelRideDto {
  @ApiProperty()
  @IsMongoId()
  rideId: string;

  @ApiProperty({
    required: false,
    example: 'Driver is taking too long',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
