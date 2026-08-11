import { ApiProperty } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsMongoId,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class BookRideDto {
  @ApiProperty({
    example: 'Lisbon City Center',
  })
  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @ApiProperty({
    example: 38.7223,
  })
  @IsLatitude()
  pickupLatitude: number;

  @ApiProperty({
    example: -9.1393,
  })
  @IsLongitude()
  pickupLongitude: number;

  @ApiProperty({
    example: 'Lisbon Destination',
  })
  @IsString()
  @IsNotEmpty()
  destinationAddress: string;

  @ApiProperty({
    example: 38.7369,
  })
  @IsLatitude()
  destinationLatitude: number;

  @ApiProperty({
    example: -9.1427,
  })
  @IsLongitude()
  destinationLongitude: number;

  @ApiProperty({
    example: '6a57307e01bd04a46c86afeb',
  })
  @IsMongoId()
  rideType: string;
}
