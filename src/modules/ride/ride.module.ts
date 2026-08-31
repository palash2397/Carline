import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';
import { Ride, RideSchema } from './schema/ride.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ride.name, schema: RideSchema }]),
  ],
  controllers: [RideController],
  providers: [RideService],
  exports: [RideService],
})
export class RideModule {}
