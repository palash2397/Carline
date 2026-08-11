import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude } from 'class-validator';

export class DriverLocationDto {
  @ApiProperty({
    example: 38.7223,
  })
  @IsLatitude()
  latitude: number;

  @ApiProperty({
    example: -9.1393,
  })
  @IsLongitude()
  longitude: number;
}
