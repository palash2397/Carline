import { IsLatitude, IsLongitude } from 'class-validator';

export class UpdateDriverLocationDto {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;
}
