import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

export class EstimateFareDto {
  @ApiProperty({ example: 38.7223 })
  @IsLatitude()
  pickupLatitude: number;

  @ApiProperty({ example: -9.1393 })
  @IsLongitude()
  pickupLongitude: number;

  @ApiProperty({ example: 38.7369 })
  @IsLatitude()
  destinationLatitude: number;

  @ApiProperty({ example: -9.1427 })
  @IsLongitude()
  destinationLongitude: number;
}
