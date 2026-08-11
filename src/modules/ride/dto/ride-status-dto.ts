import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsNotEmpty } from 'class-validator';
import { RideStatus } from 'src/common/enums/ride/ride-enum';

export class UpdateRideStatusDto {
  @ApiProperty({
    enum: [
      RideStatus.DRIVER_ARRIVED,
      RideStatus.ONGOING,
      RideStatus.PAYMENT_PENDING,
      RideStatus.COMPLETED,
    ],
  })
  @IsEnum(RideStatus)
  status: RideStatus;

  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  rideId: string;
}
