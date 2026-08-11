import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class AcceptRideDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  rideId: string;
}
