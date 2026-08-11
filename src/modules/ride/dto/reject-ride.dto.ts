import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class RejectRideDto {
  @ApiProperty()
  @IsMongoId()
  rideId: string;
}
