import { IsMongoId, IsNumber, Min } from 'class-validator';

export class CounterFareDto {
  @IsMongoId()
  rideId: string;

  @IsNumber()
  @Min(0)
  fare: number;
}
